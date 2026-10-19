import {
  Activity,
  Archive,
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Copy,
  File,
  FileText,
  Film,
  Folder,
  Globe,
  Grid2X2,
  HardDrive,
  Image,
  LayoutDashboard,
  List,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import ApiConsole from "./features/api-console/ApiConsole";

const DEFAULT_API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const PAGE_SIZE = 20;
type Workspace = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};
type VaultFile = {
  id: string;
  workspace_id: string;
  filename: string;
  mime_type: string;
  size: number;
  sha256: string;
  status: string;
  is_public: boolean;
  created_at: string;
};
type Section = "overview" | "files" | "storage" | "api" | "settings";
type FilePage = {
  items: VaultFile[];
  page: number;
  limit: number;
  total: number;
};
type Summary = { file_count: number; storage_bytes: number };
type Health = { status: string; storage: string };

const iconFor = (mime: string) =>
  mime.startsWith("image/")
    ? Image
    : mime.startsWith("video/")
      ? Film
      : mime.startsWith("audio/")
        ? AudioLines
        : mime.includes("zip")
          ? Archive
          : mime.includes("pdf")
            ? FileText
            : File;
const pretty = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : n >= 1024
        ? `${(n / 1024).toFixed(0)} KB`
        : `${n} B`;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("vault-token") || "");
  const [apiBaseUrl, setApiBaseUrl] = useState(
    localStorage.getItem("vault-api-base-url") || DEFAULT_API,
  );
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: string;
  } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    file_count: 0,
    storage_bytes: 0,
  });
  const [health, setHealth] = useState<Health | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>(
    {},
  );
  const [totalFiles, setTotalFiles] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("created");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [section, setSection] = useState<Section>("overview");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [workspaceModal, setWorkspaceModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    name: string;
    value: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState("");

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    const imageFiles = files.filter((file) =>
      file.mime_type.startsWith("image/"),
    );

    if (imageFiles.length === 0) {
      setImagePreviews({});
      return;
    }

    void Promise.all(
      imageFiles.map(async (file) => {
        try {
          const response = await fetch(
            `${apiBaseUrl.replace(/\/$/, "")}/api/v1/files/${file.id}`,
            { headers },
          );
          if (!response.ok) return null;
          const url = URL.createObjectURL(await response.blob());
          objectUrls.push(url);
          return [file.id, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setImagePreviews(
        Object.fromEntries(
          entries.filter(
            (entry): entry is NonNullable<typeof entry> => entry !== null,
          ),
        ),
      );
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files, apiBaseUrl, headers]);
  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: { ...headers, ...init.headers },
      });
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          message = body.detail || body.error?.message || message;
        } catch {
          /* use status text */
        }
        throw new Error(message);
      }
      return (response.status === 204 ? null : response.json()) as Promise<T>;
    },
    [headers, apiBaseUrl],
  );

  useEffect(() => {
    localStorage.setItem("vault-api-base-url", apiBaseUrl);
  }, [apiBaseUrl]);

  const signOut = useCallback(() => {
    localStorage.removeItem("vault-token");
    setToken("");
    setUser(null);
    setWorkspaces([]);
    setWorkspace("");
    setFiles([]);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    const [me, list] = await Promise.all([
      api<typeof user>("/api/v1/users/me"),
      api<Workspace[]>("/api/v1/workspaces"),
    ]);
    setUser(me);
    setWorkspaces(list);
    setWorkspace((active) =>
      list.some((w) => w.id === active) ? active : list[0]?.id || "",
    );
  }, [api]);

  useEffect(() => {
    if (!token) return;
    loadWorkspaces().catch((error) => {
      setNotice(error.message);
      signOut();
    });
    api<Health>("/api/v1/health")
      .then(setHealth)
      .catch(() =>
        setHealth({ status: "unavailable", storage: "unavailable" }),
      );
  }, [token, api, loadWorkspaces, signOut]);

  useEffect(() => {
    if (!token || !workspace) {
      setFiles([]);
      setTotalFiles(0);
      setSummary({ file_count: 0, storage_bytes: 0 });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingFiles(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        q: query,
        category,
        sort,
        order,
      });
      try {
        const [result, totals] = await Promise.all([
          api<FilePage>(`/api/v1/workspaces/${workspace}/files?${params}`),
          api<Summary>(`/api/v1/workspaces/${workspace}/summary`),
        ]);
        if (!cancelled) {
          setFiles(result.items);
          setTotalFiles(result.total);
          setSummary(totals);
        }
      } catch (error) {
        if (!cancelled) setNotice((error as Error).message);
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, token, workspace, page, query, category, sort, order]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (authMode === "register")
        await api("/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.get("email"),
            name: data.get("name"),
            password: data.get("password"),
          }),
        });
      const result = await api<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      localStorage.setItem("vault-token", result.access_token);
      setToken(result.access_token);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (incoming: FileList | File[] | null) => {
    const selected = incoming ? Array.from(incoming) : [];
    if (!selected.length) return;
    if (!workspace) {
      setNotice("Create or select a workspace before uploading.");
      return;
    }
    setBusy(true);
    for (const file of selected) {
      setUploadProgress({ name: file.name, value: 0 });
      try {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open(
            "POST",
            `${apiBaseUrl.replace(/\/$/, "")}/api/v1/workspaces/${workspace}/files`,
          );
          request.setRequestHeader("Authorization", `Bearer ${token}`);
          request.upload.onprogress = (event) => {
            if (event.lengthComputable)
              setUploadProgress({
                name: file.name,
                value: Math.round((event.loaded / event.total) * 100),
              });
          };
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve();
            else {
              try {
                reject(
                  new Error(
                    JSON.parse(request.responseText).detail || "Upload failed",
                  ),
                );
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          };
          request.onerror = () =>
            reject(new Error("Network error while uploading"));
          request.onabort = () => reject(new Error("Upload cancelled"));
          const body = new FormData();
          body.append("file", file);
          request.send(body);
        });
        setNotice(`${file.name} uploaded successfully`);
      } catch (error) {
        setNotice(`${file.name}: ${(error as Error).message}`);
      }
    }
    setUploadProgress(null);
    setBusy(false);
    setPage(1);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(PAGE_SIZE),
        q: query,
        category,
        sort,
        order,
      });
      const [result, totals] = await Promise.all([
        api<FilePage>(`/api/v1/workspaces/${workspace}/files?${params}`),
        api<Summary>(`/api/v1/workspaces/${workspace}/summary`),
      ]);
      setFiles(result.items);
      setTotalFiles(result.total);
      setSummary(totals);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const removeFile = async (file: VaultFile) => {
    if (
      !window.confirm(
        `Delete “${file.filename}”? This also deletes its Telegram message.`,
      )
    )
      return;
    try {
      await api(`/api/v1/files/${file.id}`, { method: "DELETE" });
      setNotice("File deleted");
      if (files.length === 1 && page > 1) setPage((n) => n - 1);
      else {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          q: query,
          category,
          sort,
          order,
        });
        const [result, totals] = await Promise.all([
          api<FilePage>(`/api/v1/workspaces/${workspace}/files?${params}`),
          api<Summary>(`/api/v1/workspaces/${workspace}/summary`),
        ]);
        setFiles(result.items);
        setTotalFiles(result.total);
        setSummary(totals);
      }
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const downloadFile = async (file: VaultFile) => {
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/v1/files/${file.id}`,
        {
          headers,
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => ({}))).detail || "Download failed",
        );
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const copyFileUrl = async (file: VaultFile) => {
    try {
      await navigator.clipboard.writeText(
        `${apiBaseUrl.replace(/\/$/, "")}/api/v1/files/${file.id}`,
      );
      setCopied(file.id);
      setNotice(
        file.is_public
          ? "Public file URL copied"
          : "Authenticated file API URL copied",
      );
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setNotice("Clipboard access is unavailable in this browser.");
    }
  };

  const setFilePublicAccess = async (file: VaultFile) => {
    try {
      const updated = await api<VaultFile>(`/api/v1/files/${file.id}/public`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: !file.is_public }),
      });
      setFiles((current) =>
        current.map((item) => (item.id === file.id ? updated : item)),
      );
      if (updated.is_public) {
        await navigator.clipboard.writeText(
          `${apiBaseUrl.replace(/\/$/, "")}/api/v1/files/${file.id}`,
        );
        setNotice(
          "Public image link enabled and copied. Anyone with the link can view this file.",
        );
      } else {
        setNotice("Public access disabled");
      }
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const created = await api<Workspace>("/api/v1/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          description: data.get("description"),
        }),
      });
      setWorkspaces((items) => [...items, created]);
      setWorkspace(created.id);
      setPage(1);
      setWorkspaceModal(false);
      setNotice("Workspace created");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteWorkspace = async (item: Workspace) => {
    if (
      !window.confirm(
        `Delete workspace “${item.name}” and all its files? Telegram media will also be deleted.`,
      )
    )
      return;
    try {
      await api(`/api/v1/workspaces/${item.id}`, { method: "DELETE" });
      const remaining = workspaces.filter((w) => w.id !== item.id);
      setWorkspaces(remaining);
      if (workspace === item.id) setWorkspace(remaining[0]?.id || "");
      setNotice("Workspace deleted");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  if (!token)
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="brand-mark">
            <Cloud size={23} />
          </div>
          <div className="eyebrow">TELE S3</div>
          <h1>
            {authMode === "register" ? "Create your account" : "Welcome back"}
          </h1>
          <p>Sign in to manage your private cloud files.</p>
          <form onSubmit={authenticate}>
            {authMode === "register" && (
              <label>
                Full name
                <input
                  required
                  name="name"
                  maxLength={120}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                required
                type="email"
                name="email"
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={authMode === "register" ? 12 : 1}
                type="password"
                name="password"
                placeholder={
                  authMode === "register"
                    ? "At least 12 characters"
                    : "Your password"
                }
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={17} />}
              {authMode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
          <div className="auth-switch">
            {authMode === "register"
              ? "Already have an account?"
              : "New to TeleCloud?"}{" "}
            <button
              onClick={() => {
                setNotice("");
                setAuthMode(authMode === "register" ? "login" : "register");
              }}
            >
              {authMode === "register" ? "Sign in" : "Create an account"}
            </button>
          </div>
          {notice && <div className="alert">{notice}</div>}
        </div>
        <div className="auth-foot">
          PRIVATE BY DESIGN <span>•</span> POWERED BY TELEGRAM MTProto
        </div>
      </div>
    );

  const activeWorkspace = workspaces.find((item) => item.id === workspace);
  const usedPct = Math.min(
    100,
    (summary.storage_bytes / (5 * 1024 ** 3)) * 100,
  );
  const sectionTitle: Record<Section, string> = {
    overview: "Overview",
    files: "All files",
    storage: "Storage",
    api: "API Keys",
    settings: "Settings",
  };

  return (
    <div
      className="app-shell"
      onDragOver={(event) => {
        event.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDrag(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        void upload(event.dataTransfer.files);
      }}
    >
      {drag && (
        <div className="drop-overlay">
          <div>
            <Upload size={35} />
            <h2>Drop files to upload</h2>
            <p>
              Files will be added to{" "}
              {activeWorkspace?.name || "your selected workspace"}
            </p>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Cloud size={21} />
          </div>
          <span>
            telecloud<span className="brand-light">vault</span>
          </span>
        </div>
        <div className="workspace-picker-wrap">
          <button
            className="workspace-select"
            onClick={() => setWorkspaceMenu((open) => !open)}
            aria-expanded={workspaceMenu}
          >
            <div className="workspace-avatar">
              {activeWorkspace?.name?.[0] || "T"}
            </div>
            <span className="workspace-name">
              {activeWorkspace?.name || "Choose workspace"}
              <small>
                {workspaces.length} workspace
                {workspaces.length === 1 ? "" : "s"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          {workspaceMenu && (
            <div className="workspace-menu">
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  className={
                    workspace === item.id
                      ? "workspace-option chosen"
                      : "workspace-option"
                  }
                  onClick={() => {
                    setWorkspace(item.id);
                    setPage(1);
                    setWorkspaceMenu(false);
                  }}
                >
                  <span className="workspace-avatar">{item.name[0]}</span>
                  <span>{item.name}</span>
                  {workspace === item.id && <Check size={15} />}
                </button>
              ))}
              <button
                className="workspace-option add-workspace"
                onClick={() => {
                  setWorkspaceMenu(false);
                  setWorkspaceModal(true);
                }}
              >
                <Plus size={15} /> Create workspace
              </button>
            </div>
          )}
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className={`nav-item ${section === "overview" ? "active" : ""}`}
            onClick={() => setSection("overview")}
          >
            <LayoutDashboard size={17} />
            Overview
          </button>
          <button
            className={`nav-item ${section === "files" ? "active" : ""}`}
            onClick={() => setSection("files")}
          >
            <Folder size={17} />
            All files<span className="nav-count">{summary.file_count}</span>
          </button>
          <button
            className={`nav-item ${section === "storage" ? "active" : ""}`}
            onClick={() => setSection("storage")}
          >
            <HardDrive size={17} />
            Storage
          </button>
          <button
            className={`nav-item ${section === "api" ? "active" : ""}`}
            onClick={() => setSection("api")}
          >
            <Shield size={17} />
            API Keys
          </button>
        </nav>
        <div className="nav-label lower-label">ACCOUNT</div>
        <nav>
          <button
            className={`nav-item ${section === "settings" ? "active" : ""}`}
            onClick={() => setSection("settings")}
          >
            <Settings size={17} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-caption">
            <span>Storage used</span>
            <b>
              {pretty(summary.storage_bytes)} <i>of 5 GB</i>
            </b>
          </div>
          <div className="meter">
            <span style={{ width: `${usedPct}%` }} />
          </div>
          <div className="storage-note">
            <span>Telegram storage</span>
            <span
              className={
                health?.storage === "available" ? "healthy" : "storage-offline"
              }
            >
              <i />
              {health?.storage === "available" ? "Connected" : "Unavailable"}
            </span>
          </div>
          <div className="profile">
            <div className="profile-avatar">{user?.name?.[0] || "U"}</div>
            <div className="profile-text">
              <b>{user?.name}</b>
              <small>{user?.email}</small>
            </div>
            <button className="icon-button" title="Sign out" onClick={signOut}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            {activeWorkspace?.name || "Workspace"}
            <ChevronRight size={14} />
            <b>{sectionTitle[section]}</b>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              title="Open API documentation"
              onClick={() =>
                window.open(
                  `${apiBaseUrl.replace(/\/$/, "")}/docs`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button"
              title="Check storage connection"
              onClick={async () => {
                try {
                  const result = await api<Health>("/api/v1/health");
                  setHealth(result);
                  setNotice(
                    `API: ${result.status} · Telegram: ${result.storage}`,
                  );
                } catch (error) {
                  setNotice((error as Error).message);
                }
              }}
            >
              <Bell size={18} />
            </button>
            <div className="top-avatar">{user?.name?.[0] || "U"}</div>
          </div>
        </header>
        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
                  .format(new Date())
                  .toUpperCase()}
              </div>
              <h1>
                {section === "overview"
                  ? `Good to see you, ${user?.name?.split(" ")[0] || "there"}`
                  : sectionTitle[section]}{" "}
                <span className="wave">✦</span>
              </h1>
              <p>
                {section === "settings"
                  ? "Manage your profile and workspaces."
                  : section === "storage"
                    ? "Review usage for the selected workspace."
                    : "Your files and storage, organized in one place."}
              </p>
            </div>
            <label className="primary upload-button">
              <Upload size={16} /> Upload files
              <input
                type="file"
                multiple
                disabled={busy || !workspace}
                onChange={(event) => {
                  void upload(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {section !== "settings" && (
            <section className="stats">
              <article className="stat-card">
                <div className="stat-top">
                  <span>Total files</span>
                  <span className="stat-icon blue">
                    <File size={17} />
                  </span>
                </div>
                <strong>{summary.file_count.toLocaleString()}</strong>
                <small>In {activeWorkspace?.name || "this workspace"}</small>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>Storage used</span>
                  <span className="stat-icon violet">
                    <HardDrive size={17} />
                  </span>
                </div>
                <strong>{pretty(summary.storage_bytes)}</strong>
                <small>Across {summary.file_count} files</small>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>Available storage</span>
                  <span className="stat-icon mint">
                    <Cloud size={17} />
                  </span>
                </div>
                <strong>
                  {pretty(Math.max(0, 5 * 1024 ** 3 - summary.storage_bytes))}
                </strong>
                <small>of the displayed 5 GB reference</small>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>Storage status</span>
                  <span className="stat-icon amber">
                    <Activity size={17} />
                  </span>
                </div>
                <strong
                  className={`status-strong ${health?.storage === "available" ? "" : "offline"}`}
                >
                  <i />
                  {health?.storage === "available"
                    ? "Connected"
                    : "Unavailable"}
                </strong>
                <small>Telegram MTProto</small>
              </article>
            </section>
          )}

          {section === "api" ? (
            <ApiConsole
              request={api}
              apiBaseUrl={apiBaseUrl}
              onSaveApiBaseUrl={setApiBaseUrl}
              workspaceId={workspace}
              workspaceName={activeWorkspace?.name || ""}
              storageStatus={health?.storage || "unavailable"}
              onNotice={setNotice}
            />
          ) : section === "settings" ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>Account</h2>
                  <p>Signed in as {user?.email}</p>
                </div>
                <span className="role-pill">{user?.role}</span>
              </div>
              <div className="settings-card">
                <div className="settings-profile">
                  <div className="profile-avatar large-avatar">
                    {user?.name?.[0] || "U"}
                  </div>
                  <div>
                    <b>{user?.name}</b>
                    <small>{user?.email}</small>
                  </div>
                </div>
                <button className="outline-button" onClick={signOut}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
              <div className="section-heading settings-heading">
                <div>
                  <h2>Workspaces</h2>
                  <p>Choose, create, or delete your workspaces.</p>
                </div>
                <button
                  className="outline-button"
                  onClick={() => setWorkspaceModal(true)}
                >
                  <Plus size={16} /> New workspace
                </button>
              </div>
              <div className="workspace-list">
                {workspaces.map((item) => (
                  <article className="workspace-row" key={item.id}>
                    <div className="workspace-avatar">{item.name[0]}</div>
                    <div className="workspace-row-info">
                      <b>
                        {item.name}
                        {item.id === workspace && (
                          <span className="current-tag">CURRENT</span>
                        )}
                      </b>
                      <small>{item.description || "No description"}</small>
                    </div>
                    <button
                      className="outline-button"
                      onClick={() => {
                        setWorkspace(item.id);
                        setSection("overview");
                        setPage(1);
                      }}
                    >
                      Open
                    </button>
                    <button
                      className="icon-button danger-button"
                      title={`Delete ${item.name}`}
                      onClick={() => void deleteWorkspace(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : section === "storage" ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>Workspace usage</h2>
                  <p>Usage totals come from saved file metadata.</p>
                </div>
                <span className="role-pill">{activeWorkspace?.name}</span>
              </div>
              <div className="storage-detail-card">
                <div className="storage-detail-top">
                  <div className="stat-icon violet">
                    <HardDrive size={19} />
                  </div>
                  <span>{pretty(summary.storage_bytes)} used</span>
                </div>
                <div className="large-meter">
                  <span style={{ width: `${usedPct}%` }} />
                </div>
                <div className="storage-detail-bottom">
                  <span>{summary.file_count} stored files</span>
                  <span>
                    {pretty(Math.max(0, 5 * 1024 ** 3 - summary.storage_bytes))}{" "}
                    available of 5 GB reference
                  </span>
                </div>
              </div>
              <div className="settings-card">
                <div>
                  <b>Telegram storage connection</b>
                  <small>Live status from the backend health endpoint</small>
                </div>
                <span
                  className={
                    health?.storage === "available"
                      ? "healthy"
                      : "storage-offline"
                  }
                >
                  <i />
                  {health?.storage === "available"
                    ? "Connected"
                    : "Not connected"}
                </span>
                <button
                  className="outline-button"
                  onClick={async () => {
                    try {
                      const result = await api<Health>("/api/v1/health");
                      setHealth(result);
                      setNotice(`Telegram storage: ${result.storage}`);
                    } catch (error) {
                      setNotice((error as Error).message);
                    }
                  }}
                >
                  Refresh status
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    {section === "overview" ? "Files Vault" : "All files"}
                  </h2>
                  <p>
                    {section === "overview"
                      ? "Browse and manage files in this workspace."
                      : `Search and organize ${summary.file_count} stored files.`}
                  </p>
                </div>
                <button
                  className="outline-button"
                  onClick={() => setWorkspaceModal(true)}
                >
                  <Plus size={16} /> New workspace
                </button>
              </div>
              <div className="file-toolbar">
                <div className="tabs">
                  <span className="tab selected">
                    {section === "overview" ? "Recent files" : "Files"}
                    <span>{totalFiles}</span>
                  </span>
                </div>
                <div className="toolbar-right">
                  <div className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search files by name"
                      placeholder="Search files..."
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setPage(1);
                      }}
                    />
                    <kbd>⌕</kbd>
                  </div>
                  <select
                    aria-label="Filter by file type"
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All types</option>
                    <option value="images">Images</option>
                    <option value="videos">Videos</option>
                    <option value="documents">Documents</option>
                    <option value="audio">Audio</option>
                    <option value="archives">Archives</option>
                  </select>
                  <select
                    aria-label="Sort files"
                    value={`${sort}:${order}`}
                    onChange={(event) => {
                      const [nextSort, nextOrder] =
                        event.target.value.split(":");
                      setSort(nextSort);
                      setOrder(nextOrder);
                      setPage(1);
                    }}
                  >
                    <option value="created:desc">Newest first</option>
                    <option value="created:asc">Oldest first</option>
                    <option value="name:asc">Name A–Z</option>
                    <option value="name:desc">Name Z–A</option>
                    <option value="size:desc">Largest first</option>
                    <option value="size:asc">Smallest first</option>
                  </select>
                  <button
                    className={`view-toggle ${view === "grid" ? "selected-view" : ""}`}
                    onClick={() => setView("grid")}
                    aria-label="Grid view"
                  >
                    <Grid2X2 size={16} />
                  </button>
                  <button
                    className={`view-toggle ${view === "list" ? "selected-view" : ""}`}
                    onClick={() => setView("list")}
                    aria-label="List view"
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
              {loadingFiles ? (
                <div className="empty">
                  <LoaderCircle className="spin" size={24} />
                  <p>Loading files…</p>
                </div>
              ) : files.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <Folder size={26} />
                  </div>
                  <h3>
                    {query || category !== "all"
                      ? "No matching files"
                      : "Your vault is ready"}
                  </h3>
                  <p>
                    {query || category !== "all"
                      ? "Change the search or filter to see more files."
                      : "Upload your first file to start building your cloud library."}
                  </p>
                  {!query && category === "all" && (
                    <label className="primary">
                      <Upload size={16} /> Upload your first file
                      <input
                        type="file"
                        multiple
                        disabled={!workspace || busy}
                        onChange={(event) => {
                          void upload(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <div className={view === "grid" ? "file-grid" : "file-list"}>
                  {files.map((file) => {
                    const Icon = iconFor(file.mime_type);
                    return (
                      <article className="file-card" key={file.id}>
                        <button
                          className="file-preview preview-button"
                          onClick={() => void downloadFile(file)}
                          title={`Download ${file.filename}`}
                        >
                          {imagePreviews[file.id] ? (
                            <img
                              className="file-thumbnail"
                              src={imagePreviews[file.id]}
                              alt=""
                            />
                          ) : (
                            <span
                              className={`file-type ${file.mime_type.startsWith("image/") ? "image-type" : file.mime_type.startsWith("video/") ? "video-type" : ""}`}
                            >
                              <Icon size={22} />
                            </span>
                          )}
                        </button>
                        <div className="file-info">
                          <b title={file.filename}>{file.filename}</b>
                          <small>
                            {pretty(file.size)} <span>·</span>{" "}
                            {new Date(file.created_at).toLocaleDateString()}
                          </small>
                        </div>
                        <div className="file-actions">
                          <button
                            onClick={() => void setFilePublicAccess(file)}
                            title={
                              file.is_public
                                ? "Disable public access"
                                : "Allow anyone with the link to view this file"
                            }
                          >
                            <Globe size={15} />{" "}
                            {file.is_public ? "Make private" : "Make public"}
                          </button>
                          <button onClick={() => void downloadFile(file)}>
                            <File size={15} /> Download
                          </button>
                          <button
                            title="Copy authenticated API URL"
                            onClick={() => void copyFileUrl(file)}
                          >
                            {copied === file.id ? (
                              <Check size={15} />
                            ) : (
                              <Copy size={15} />
                            )}{" "}
                            Link
                          </button>
                          <button
                            className="delete-action"
                            title="Delete file"
                            onClick={() => void removeFile(file)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <footer className="content-footer">
                <span>
                  {totalFiles === 0
                    ? "No files"
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalFiles)} of ${totalFiles}`}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    disabled={page <= 1 || loadingFiles}
                    onClick={() => setPage((n) => Math.max(1, n - 1))}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>Page {page}</span>
                  <button
                    aria-label="Next page"
                    disabled={page * PAGE_SIZE >= totalFiles || loadingFiles}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </main>

      {uploadProgress && (
        <div className="upload-progress">
          <div>
            <Upload size={16} />
            <span>Uploading {uploadProgress.name}</span>
            <b>{uploadProgress.value}%</b>
          </div>
          <div className="meter">
            <span style={{ width: `${uploadProgress.value}%` }} />
          </div>
        </div>
      )}
      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          <span>{notice}</span>
          <X size={15} />
        </button>
      )}
      {workspaceModal && (
        <div
          className="modal-backdrop"
          onClick={() => setWorkspaceModal(false)}
        >
          <form
            className="modal"
            onSubmit={(event) => void createWorkspace(event)}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setWorkspaceModal(false)}
            >
              <X size={18} />
            </button>
            <div className="eyebrow">WORKSPACE</div>
            <h2>Create a workspace</h2>
            <p>Keep files organized in a separate workspace.</p>
            <label>
              Workspace name
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. Product assets"
              />
            </label>
            <label>
              Description <span className="optional">Optional</span>
              <textarea
                name="description"
                maxLength={2000}
                placeholder="What is this workspace for?"
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "Creating…" : "Create workspace"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
