# TeleCloud Vault

Telegram-backed cloud storage with a React dashboard and FastAPI REST API. The application stores file bytes in a private Telegram channel through an authenticated MTProto user session; PostgreSQL stores metadata only.

## Status

The current implementation provides registration/login, JWT-protected workspaces, streaming multipart uploads with size/checksum validation, file listing/download/delete, workspace-scoped upload API keys, API docs, health checks, and a dashboard for workspace/file management.

## Run both apps locally (Windows PowerShell)

Prerequisites: Python 3.12 or 3.14, Node.js 20+, npm, and Docker Desktop (for PostgreSQL).

### 1. Configure the backend

From the project root:

```powershell
Copy-Item backend/.env.example backend/.env
notepad backend/.env
```

Set `JWT_SECRET_KEY` to a long random secret. Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from your Telegram developer account. For local development, set these values in `backend/.env`:

```dotenv
DATABASE_URL=postgresql+asyncpg://postgres:localdevchange@localhost:5432/telecloud_vault
TELEGRAM_SESSION_PATH=./telegram_session
```

### 2. Start PostgreSQL

```powershell
docker compose up -d db
```

PostgreSQL listens only on this computer at `localhost:5432`.

### 3. Install and start the backend

Open a terminal in the project root and run (PowerShell shown):

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Set-Location backend
.\.venv\Scripts\python.exe -m pip install telethon python-dotenv
.\.venv\Scripts\python.exe get_channel_id.py
```

Enter your Telegram login code (and 2FA password if prompted). Choose a private channel where your account can post, then put its printed ID into `TELEGRAM_STORAGE_CHANNEL_ID` in `backend/.env`. The script saves the authenticated session at `backend/telegram_session`; keep it private.

Then, in that same terminal, start the API:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

The backend runs at `http://localhost:8000`; interactive API docs are at `http://localhost:8000/docs`.

### 4. Install and start the frontend

Open a second PowerShell terminal in the project root:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Keep both the backend and frontend terminals running. Register the first account in the app to create your admin user.

## Run with Docker instead

1. Create and configure `backend/.env` as described above. The Docker Compose backend uses the `db` service automatically; the local `localhost` database URL is overridden inside the container.
2. Build the backend image and authenticate the Telegram account into the persistent session volume:

   ```powershell
   docker compose build backend
   docker compose run --rm backend python get_channel_id.py
   ```

   Set the printed private channel ID as `TELEGRAM_STORAGE_CHANNEL_ID` in `backend/.env`. The Telegram account must be able to post to that channel.

3. Start all services and apply the migration:

   ```powershell
   docker compose up --build -d
   docker compose exec backend alembic upgrade head
   ```

4. Open `http://localhost:5173` and API docs at `http://localhost:8000/docs`. Stop the services with `docker compose down` (data volumes remain intact).

### Git Bash commands when you are already in `backend/`

The channel ID helper only needs Telethon and python-dotenv. These commands also work if Python 3.12 is not installed (they use the `python` on your PATH):

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install --upgrade pip
python -m pip install telethon python-dotenv
python get_channel_id.py
```

Enter the login code when prompted. If `python -m venv .venv` fails, run `python --version` and install/use a supported Python interpreter. For running the full backend rather than only the Telegram channel helper, install all dependencies with `python -m pip install -r requirements.txt` Python 3.12 or 3.14 works with the pinned dependencies.

To start the full backend from Git Bash (with `.venv` activated), first ensure `backend/.env` is configured and PostgreSQL is running. From the repository root, start PostgreSQL with `docker compose up -d db`, then return to `backend/` and run:

```bash
python -m pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --reload
```

Use `python -m uvicorn` in Git Bash; the PowerShell executable path shown earlier is PowerShell-specific. Start the frontend separately in another terminal from the repository root with `cd frontend && npm ci && npm run dev`.

The default provider is Telegram and refuses file operations if Telegram credentials are missing. PostgreSQL is bound to localhost for local development. Keep `.env` and the Telegram session file private and backed up. Set `MAX_UPLOAD_SIZE_MB` to a value supported by Telegram and your deployment. Telegram media references have Telegram's lifecycle/access limits and are not equivalent to permanent object storage.

The first registered account receives the `ADMIN` role; registration after that creates regular users. Review deployment security, Telegram limitations and TLS configuration before exposing this service publicly.

## Upload files with the API

Sign in to the dashboard, open **API Keys**, and create a key for the selected workspace. The API Console can verify, rotate, and revoke keys, configure the API server URL in that browser, send multipart uploads, and show HTTP responses. The API URL setting is stored in browser local storage; Telegram credentials and the Telegram session remain backend-only. Copy a newly created key when shown because the full secret is only returned once.

Use the workspace UUID shown in the dashboard (this app does not use numeric workspace IDs). In Postman choose **Body → form-data**, set `file` to **File**, and add `workspace_id`, `caption`, and optional `is_public` as **Text** fields. Send the API key and workspace UUID as headers too. Do not set the multipart `Content-Type` manually; Postman must add its boundary.

```bash
curl -X POST "http://localhost:8000/api/v1/upload" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-workspace-id: YOUR_WORKSPACE_UUID" \
  -F "file=@./example.pdf" \
  -F "workspace_id=YOUR_WORKSPACE_UUID" \
  -F "caption=Uploaded via API" \
  -F "is_public=false"
```

Successful uploads return HTTP `200` and JSON like:

```json
{
  "success": true,
  "file_id": "<file UUID>",
  "file_url": "http://localhost:8000/api/v1/files/<file UUID>",
  "file_name": "example.pdf",
  "file_size": 48123,
  "mime_type": "application/pdf",
  "workspace_id": "<workspace UUID>",
  "checksum_sha256": "<sha256>",
  "is_public": false
}
```

Set `is_public=true` only for files intended to be viewable by anyone who has the URL. Public images open inline without authentication. Private downloads require the same `x-api-key` header (or a user JWT):

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  "http://localhost:8000/api/v1/files/FILE_UUID" \
  --output downloaded-file
```

Keys are scoped to the workspace where they were created. Revoke a key from the dashboard when it is no longer needed. Do not put API keys in source control or expose them in browser code.

The API Console includes request/response examples for the authentication, user, workspace, key management, upload, file access, public access, and health routes. Upload errors return a JSON `detail`, such as `401` for an invalid key, `403` for a key/workspace mismatch, `409` for a duplicate, `413` for a file over the configured limit, or `503` when Telegram storage is unavailable. Full schemas and interactive requests are at `http://localhost:8000/docs`.
