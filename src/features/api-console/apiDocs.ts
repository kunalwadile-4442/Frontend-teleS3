export type ApiEndpointDoc = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  auth: string;
  request: string;
  response: string;
};

export const apiEndpointDocs: ApiEndpointDoc[] = [
  {
    method: "POST",
    path: "/api/v1/upload",
    title: "Upload a file",
    description: "Uploads a file to Telegram storage and saves its metadata in the selected workspace.",
    auth: "x-api-key + x-workspace-id",
    request: "multipart/form-data\nfile: binary (required)\nworkspace_id: UUID (required)\ncaption: string (optional)\nis_public: boolean (optional, default false)",
    response: '{\n  "success": true,\n  "file_id": "<uuid>",\n  "file_url": "http://localhost:8000/api/v1/files/<uuid>",\n  "file_name": "image.png",\n  "file_size": 48123,\n  "mime_type": "image/png",\n  "workspace_id": "<uuid>",\n  "checksum_sha256": "<sha256>",\n  "is_public": true\n}',
  },
  {
    method: "POST",
    path: "/api/v1/api-keys/verify",
    title: "Verify an API key",
    description: "Checks that the key is active and scoped to the requested workspace.",
    auth: "x-api-key + x-workspace-id",
    request: "Headers:\nx-api-key: tc_live_…\nx-workspace-id: <workspace UUID>\nBody: empty",
    response: '{\n  "valid": true,\n  "integrity": "verified",\n  "key_prefix": "tc_live_…",\n  "key_name": "Website uploads",\n  "workspace_id": "<uuid>"\n}',
  },
  {
    method: "GET",
    path: "/api/v1/files/{file_id}",
    title: "Download a file",
    description: "Returns file bytes. Public files can be read without a key; private files require JWT or a scoped API key.",
    auth: "x-api-key or Bearer token; omitted for public files",
    request: "Path parameter:\nfile_id: UUID",
    response: "200 OK\nContent-Type: image/png (or the stored MIME type)\nResponse body: binary file bytes",
  },
  {
    method: "GET",
    path: "/api/v1/health",
    title: "Check service health",
    description: "Checks that the REST API responds and reports Telegram storage connectivity.",
    auth: "None",
    request: "No headers or body required",
    response: '{\n  "status": "ok",\n  "storage": "available"\n}',
  },
  {
    method: "GET",
    path: "/api/v1/workspaces/{workspace_id}/files",
    title: "List workspace files",
    description: "Returns paginated workspace file metadata. Supports q, category, sort, order, page, and limit query parameters.",
    auth: "Bearer token",
    request: "Query example:\n?page=1&limit=20&category=images",
    response: '{\n  "items": [\n    {\n      "id": "<uuid>",\n      "filename": "image.png",\n      "mime_type": "image/png",\n      "size": 48123,\n      "is_public": false\n    }\n  ],\n  "page": 1,\n  "limit": 20,\n  "total": 1\n}',
  },
];

apiEndpointDocs.push(
  {
    method: "POST", path: "/api/v1/auth/register", title: "Create an account",
    description: "Registers a user and creates their first workspace. The first account receives the ADMIN role.", auth: "None",
    request: 'application/json\n{ "email": "you@example.com", "name": "Alex Morgan", "password": "at-least-12-characters" }',
    response: '{\n  "id": "<uuid>",\n  "email": "you@example.com",\n  "name": "Alex Morgan",\n  "role": "ADMIN"\n}',
  },
  {
    method: "POST", path: "/api/v1/auth/login", title: "Sign in",
    description: "Exchanges an email and password for a bearer access token.", auth: "None",
    request: 'application/json\n{ "email": "you@example.com", "password": "your-password" }',
    response: '{\n  "access_token": "<jwt>",\n  "token_type": "bearer"\n}',
  },
  {
    method: "GET", path: "/api/v1/users/me", title: "Get current user",
    description: "Returns the signed-in account profile.", auth: "Authorization: Bearer <jwt>", request: "No body required",
    response: '{\n  "id": "<uuid>",\n  "email": "you@example.com",\n  "name": "Alex Morgan",\n  "role": "ADMIN"\n}',
  },
  {
    method: "GET", path: "/api/v1/workspaces", title: "List workspaces",
    description: "Lists workspaces owned by the signed-in user.", auth: "Authorization: Bearer <jwt>", request: "No body required",
    response: '[\n  {\n    "id": "<uuid>",\n    "name": "My Workspace",\n    "description": "",\n    "created_at": "<timestamp>"\n  }\n]',
  },
  {
    method: "POST", path: "/api/v1/workspaces", title: "Create workspace",
    description: "Creates a workspace for the signed-in user.", auth: "Authorization: Bearer <jwt>",
    request: 'application/json\n{ "name": "Product assets", "description": "Optional description" }',
    response: '{\n  "id": "<uuid>",\n  "name": "Product assets",\n  "description": "Optional description",\n  "created_at": "<timestamp>"\n}',
  },
  {
    method: "GET", path: "/api/v1/workspaces/{workspace_id}/summary", title: "Get workspace summary",
    description: "Returns the file count and total stored bytes.", auth: "Authorization: Bearer <jwt>", request: "Path parameter: workspace_id (UUID)",
    response: '{\n  "file_count": 3,\n  "storage_bytes": 125000\n}',
  },
  {
    method: "POST", path: "/api/v1/workspaces/{workspace_id}/files", title: "Upload with user session",
    description: "Uploads a file using the signed-in user instead of an API key.", auth: "Authorization: Bearer <jwt>",
    request: "multipart/form-data\nfile: binary (required)\ncaption: string (optional)\nis_public: boolean (optional)",
    response: '{\n  "id": "<uuid>",\n  "workspace_id": "<uuid>",\n  "filename": "image.png",\n  "mime_type": "image/png",\n  "size": 48123,\n  "is_public": false,\n  "status": "complete"\n}',
  },
  {
    method: "GET", path: "/api/v1/workspaces/{workspace_id}/api-keys", title: "List workspace API keys",
    description: "Lists key metadata. Secret values are never returned after creation.", auth: "Authorization: Bearer <jwt>", request: "Path parameter: workspace_id (UUID)",
    response: '[\n  {\n    "id": "<uuid>",\n    "name": "Website uploads",\n    "key_prefix": "tc_live_...",\n    "created_at": "<timestamp>",\n    "revoked_at": null\n  }\n]',
  },
  {
    method: "POST", path: "/api/v1/workspaces/{workspace_id}/api-keys", title: "Create API key",
    description: "Creates a workspace-scoped key. The full secret is returned only once.", auth: "Authorization: Bearer <jwt>",
    request: 'application/json\n{ "name": "Website uploads" }',
    response: '{\n  "id": "<uuid>",\n  "name": "Website uploads",\n  "key_prefix": "tc_live_...",\n  "key": "tc_live_<secret shown once>",\n  "created_at": "<timestamp>",\n  "revoked_at": null\n}',
  },
  {
    method: "DELETE", path: "/api/v1/workspaces/{workspace_id}", title: "Delete workspace",
    description: "Deletes the workspace and its Telegram media.", auth: "Authorization: Bearer <jwt>", request: "Path parameter: workspace_id (UUID)", response: "204 No Content",
  },
  {
    method: "DELETE", path: "/api/v1/api-keys/{key_id}", title: "Revoke API key",
    description: "Revokes an API key owned by the signed-in user. Future requests using the key return 401.", auth: "Authorization: Bearer <jwt>", request: "Path parameter: key_id (UUID)", response: "204 No Content",
  },
  {
    method: "DELETE", path: "/api/v1/files/{file_id}", title: "Delete file",
    description: "Deletes the Telegram media and file metadata.", auth: "Authorization: Bearer <jwt>", request: "Path parameter: file_id (UUID)", response: "204 No Content",
  },
  {
    method: "PATCH", path: "/api/v1/files/{file_id}/public", title: "Set public access",
    description: "Enables or disables unauthenticated access. Anyone with a public file URL can view it.", auth: "Authorization: Bearer <jwt>",
    request: 'application/json\n{ "is_public": true }',
    response: '{\n  "id": "<uuid>",\n  "filename": "image.png",\n  "mime_type": "image/png",\n  "is_public": true\n}',
  },
);
