import {
  Activity,
  Check,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Terminal,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { apiEndpointDocs } from "./apiDocs";

type ApiKey = {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
};
type ApiRequest = <T,>(path: string, init?: RequestInit) => Promise<T>;
type ApiConsoleProps = {
  request: ApiRequest;
  apiBaseUrl: string;
  onSaveApiBaseUrl: (url: string) => void;
  workspaceId: string;
  workspaceName: string;
  storageStatus: string;
  onNotice: (message: string) => void;
};
type VerifyResult = {
  valid: boolean;
  integrity: string;
  key_prefix: string;
  key_name: string;
  workspace_id: string;
};

const fieldClass = "w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";
const mutedButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function ApiConsole({
  request,
  apiBaseUrl,
  onSaveApiBaseUrl,
  workspaceId,
  workspaceName,
  storageStatus,
  onNotice,
}: ApiConsoleProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [keyName, setKeyName] = useState("Workspace Upload Key");
  const [secret, setSecret] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [verified, setVerified] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [requestTab, setRequestTab] = useState<"try" | "reference">("try");
  const [draftBaseUrl, setDraftBaseUrl] = useState(apiBaseUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("Uploaded via TeleCloud API Console");
  const [makePublic, setMakePublic] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeKey = useMemo(() => keys.find((key) => !key.revoked_at), [keys]);
  const keyToVerify = secret || manualKey.trim();
  const curlExample = `curl -X POST "${apiBaseUrl}/api/v1/upload" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "x-workspace-id: ${workspaceId || "YOUR_WORKSPACE_UUID"}" \\
  -F "file=@./image.png" \\
  -F "workspace_id=${workspaceId || "YOUR_WORKSPACE_UUID"}" \\
  -F "caption=Uploaded via API" \\
  -F "is_public=${makePublic ? "true" : "false"}"`;

  useEffect(() => {
    setDraftBaseUrl(apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!workspaceId) {
      setKeys([]);
      return;
    }
    let cancelled = false;
    setLoadingKeys(true);
    request<ApiKey[]>(`/api/v1/workspaces/${workspaceId}/api-keys`)
      .then((data) => {
        if (!cancelled) setKeys(data);
      })
      .catch((error) => {
        if (!cancelled) onNotice((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingKeys(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, workspaceId, onNotice]);

  const createKey = async () => {
    if (!workspaceId || !keyName.trim()) return;
    if (activeKey && !window.confirm("Create a replacement API key and revoke the current active key? Integrations using the old key will stop working.")) return;
    setRotating(true);
    try {
      const created = await request<ApiKey & { key: string }>(
        `/api/v1/workspaces/${workspaceId}/api-keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: keyName.trim() }),
        },
      );
      setKeys((previous) => [created, ...previous]);
      setSecret(created.key);
      setManualKey("");
      setShowKey(false);
      setVerified(null);
      if (activeKey) {
        try {
          await request(`/api/v1/api-keys/${activeKey.id}`, { method: "DELETE" });
          setKeys((previous) =>
            previous.map((key) => key.id === activeKey.id ? { ...key, revoked_at: new Date().toISOString() } : key),
          );
        } catch {
          onNotice("New key created, but the previous key could not be revoked. Revoke it from the key list.");
        }
      }
      onNotice("API key created. Copy the secret now; it is shown only once.");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setRotating(false);
    }
  };

  const revokeKey = async (key: ApiKey) => {
    if (!window.confirm(`Revoke “${key.name}”? Integrations using it will stop working.`)) return;
    try {
      await request(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
      setKeys((previous) => previous.map((item) => item.id === key.id ? { ...item, revoked_at: new Date().toISOString() } : item));
      if (secret && key.key_prefix === secret.slice(0, 16)) setSecret("");
      setVerified(null);
      onNotice("API key revoked");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const verifyKey = async () => {
    if (!keyToVerify) {
      onNotice("Create a key or paste an API key to verify it.");
      return;
    }
    setVerifying(true);
    setVerified(null);
    try {
      const result = await request<VerifyResult>("/api/v1/api-keys/verify", {
        method: "POST",
        headers: {
          "x-api-key": keyToVerify,
          "x-workspace-id": workspaceId,
        },
      });
      setVerified(result);
      onNotice("API key and workspace integrity verified");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const copyKey = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      onNotice("API key copied to clipboard");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotice("Clipboard access is unavailable. Select and copy the key manually.");
    }
  };

  const sendUpload = async () => {
    if (!selectedFile) {
      onNotice("Choose an image or file before sending the request.");
      return;
    }
    if (!keyToVerify) {
      onNotice("Create or paste an API key before sending the request.");
      return;
    }
    setSending(true);
    setResponse(null);
    setResponseStatus(null);
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("workspace_id", workspaceId);
    form.append("caption", caption);
    form.append("is_public", String(makePublic));
    const started = performance.now();
    try {
      const result = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/upload`, {
        method: "POST",
        headers: {
          "x-api-key": keyToVerify,
          "x-workspace-id": workspaceId,
        },
        body: form,
      });
      const raw = await result.text();
      let parsed: unknown = raw;
      try { parsed = JSON.parse(raw); } catch { /* keep text responses readable */ }
      setResponse(parsed);
      setResponseStatus(result.status);
      setElapsedMs(Math.round(performance.now() - started));
      if (!result.ok) onNotice(typeof parsed === "object" && parsed && "detail" in parsed ? String((parsed as { detail: unknown }).detail) : `Upload failed (${result.status})`);
      else onNotice("Upload completed successfully");
    } catch (error) {
      setResponse({ error: (error as Error).message });
      setResponseStatus(0);
      setElapsedMs(Math.round(performance.now() - started));
      onNotice(`Request failed: ${(error as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const onChooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const saveApiUrl = () => {
    const normalized = draftBaseUrl.trim().replace(/\/$/, "");
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      onSaveApiBaseUrl(normalized);
      onNotice("API server URL saved in this browser");
    } catch {
      onNotice("Enter a valid API server URL, such as http://localhost:8000");
    }
  };

  const currentDoc = apiEndpointDocs[selectedDoc];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-panel">
        <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-indigo-950/60 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300"><Terminal size={20} /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 text-xs font-bold tracking-wide text-white">API AUTHENTICATION & KEY MANAGEMENT</p>
                  <span className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">WORKSPACE SCOPED</span>
                </div>
                <p className="mb-0 mt-1 text-xs text-slate-400">Manage your key, configure the client URL, and inspect real API requests and responses.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={mutedButtonClass} disabled={!keyToVerify || verifying} onClick={() => void verifyKey()}>
                {verifying ? <LoaderCircle className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                {verifying ? "Verifying…" : "Verify key & integrity"}
              </button>
              <button className={buttonClass} disabled={!workspaceId || rotating} onClick={() => void createKey()}>
                {rotating ? <LoaderCircle className="animate-spin" size={15} /> : activeKey ? <RefreshCw size={15} /> : <KeyRound size={15} />}
                {rotating ? "Working…" : activeKey ? "Regenerate API key" : "Create API key"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><KeyRound size={15} className="text-indigo-300" /> API key</div>
              {verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300"><Check size={12} /> VERIFIED</span>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <input
                  aria-label="API key"
                  className={`${fieldClass} pr-12 font-mono text-xs`}
                  type={showKey ? "text" : "password"}
                  value={secret || manualKey || (activeKey ? `${activeKey.key_prefix}••••••••••••••••••••••` : "")}
                  onChange={(event) => { setSecret(""); setManualKey(event.target.value); setVerified(null); }}
                  placeholder="Create a key or paste an existing tc_live_ key"
                  autoComplete="off"
                />
                <button className="absolute inset-y-0 right-2 my-auto rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title={showKey ? "Hide key" : "Reveal key"} onClick={() => setShowKey((shown) => !shown)}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button className={mutedButtonClass} disabled={!secret} onClick={() => void copyKey()}>{copied ? <Check size={15} /> : <Copy size={15} />} Copy key</button>
            </div>
            <p className="mb-0 mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><CircleHelp size={12} />The full key is only returned once. Existing keys are stored as hashes and cannot be revealed again.</p>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <InfoPill label="ACTIVE WORKSPACE" value={`${workspaceName || "No workspace"} · ${workspaceId || "Select a workspace"}`} color="text-violet-300" />
              <InfoPill label="TELEGRAM STORAGE" value={storageStatus === "available" ? "Connected" : "Unavailable"} color={storageStatus === "available" ? "text-emerald-300" : "text-orange-300"} />
              <InfoPill label="ACTIVE API KEY" value={activeKey ? `${activeKey.name} · ${activeKey.key_prefix}…` : "No active key"} color="text-cyan-300" />
            </div>
            {verified && <div className="mt-3 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">Key is valid and scoped to workspace <code>{verified.workspace_id}</code>.</div>}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.78fr)]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-200"><Cloud size={15} className="text-cyan-300" /> Client configuration</div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="api-base-url">API server URL</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="api-base-url" className={fieldClass} value={draftBaseUrl} onChange={(event) => setDraftBaseUrl(event.target.value)} placeholder="http://localhost:8000" />
                <button className={mutedButtonClass} onClick={saveApiUrl}>Save URL</button>
              </div>
              <p className="mb-0 mt-2 text-[10px] leading-5 text-slate-500">Saved in this browser for this dashboard. Server secrets and Telegram session credentials remain on the backend.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-200"><LockKeyhole size={15} className="text-amber-300" /> Key label</div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="api-key-name">Integration name</label>
              <input id="api-key-name" className={fieldClass} value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={120} placeholder="Website uploads" />
              <p className="mb-0 mt-2 text-[10px] leading-5 text-slate-500">Regenerating creates a replacement key and revokes the current active key.</p>
            </div>
          </div>

          {keys.length > 0 && <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><div className="text-xs font-bold text-slate-200">Workspace keys</div>{loadingKeys && <LoaderCircle className="animate-spin text-slate-500" size={15} />}</div>
            <div className="space-y-2">
              {keys.map((key) => <div key={key.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300"><KeyRound size={15} /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-200">{key.name}</div><div className="mt-1 font-mono text-[10px] text-slate-500">{key.key_prefix}… · {new Date(key.created_at).toLocaleDateString()}</div></div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${key.revoked_at ? "bg-slate-800 text-slate-500" : "bg-emerald-400/10 text-emerald-300"}`}>{key.revoked_at ? "Revoked" : "Active"}</span>
                {!key.revoked_at && <button className="rounded-lg p-2 text-slate-500 hover:bg-red-400/10 hover:text-red-300" title="Revoke key" onClick={() => void revokeKey(key)}><ShieldOff size={15} /></button>}
              </div>)}
            </div>
          </div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-7">
          <div><div className="flex items-center gap-2 text-sm font-bold"><Activity size={17} className="text-cyan-300" /> API Request Console</div><p className="mb-0 mt-1 text-[11px] text-slate-500">Build a real multipart upload request and inspect the actual HTTP response.</p></div>
          <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <TabButton active={requestTab === "try"} onClick={() => setRequestTab("try")}>Try request</TabButton>
            <TabButton active={requestTab === "reference"} onClick={() => setRequestTab("reference")}>API reference</TabButton>
          </div>
        </div>

        {requestTab === "try" ? <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(310px,.9fr)]">
          <div className="space-y-5 border-b border-slate-800 p-5 lg:border-b-0 lg:border-r sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row">
              <span className="inline-flex items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300">POST</span>
              <div className="flex min-w-0 flex-1 items-center rounded-xl border border-slate-800 bg-slate-900 px-3 font-mono text-xs"><span className="truncate text-slate-400">{apiBaseUrl.replace(/\/$/, "")}</span><span className="ml-2 shrink-0 text-indigo-300">/api/v1/upload</span></div>
              <button className={buttonClass} onClick={() => void sendUpload()} disabled={sending || !workspaceId}><UploadCloud size={15} />{sending ? "Sending…" : "Send request"}</button>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Request headers</div>
              <HeaderRow name="x-api-key" value={keyToVerify ? `${keyToVerify.slice(0, 12)}••••••••` : "Create or paste an API key"} />
              <HeaderRow name="x-workspace-id" value={workspaceId || "Select a workspace"} />
              <div className="mt-2 text-[10px] text-slate-500">Multipart Content-Type is set automatically by the browser, including its boundary.</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Body · multipart/form-data</div><span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[9px] font-bold text-cyan-300">FILE + TEXT FIELDS</span></div>
              <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-3 transition hover:border-indigo-400/70">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/10 text-indigo-300"><FileUp size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{selectedFile?.name || "Choose image or file"}</span><span className="mt-1 block text-[10px] text-slate-500">file · File / binary {selectedFile ? `· ${(selectedFile.size / 1024).toFixed(1)} KB` : "· required"}</span></span>
                <span className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300">Browse</span>
                <input type="file" className="sr-only" onChange={onChooseFile} />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">workspace_id · Text</span><input className={fieldClass} value={workspaceId} readOnly /></label>
                <label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">caption · Text</span><input className={fieldClass} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1024} /></label>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[10px] text-slate-400"><input className="mt-0.5 accent-indigo-500" type="checkbox" checked={makePublic} onChange={(event) => setMakePublic(event.target.checked)} /><span><span className="block font-semibold text-slate-200">is_public · Boolean</span>Let anyone with the returned file URL view it without authentication.</span></label>
            </div>
            <CodeBlock title="Equivalent cURL request" code={curlExample} />
          </div>

          <div className="min-w-0 bg-slate-900/30 p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="text-xs font-bold text-slate-200">Response</div>{responseStatus !== null && <div className="flex items-center gap-3 text-[10px]"><span className={`rounded-full px-2.5 py-1 font-bold ${responseStatus >= 200 && responseStatus < 300 ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>HTTP {responseStatus || "ERROR"}</span>{elapsedMs !== null && <span className="text-slate-500">{elapsedMs} ms</span>}</div>}</div>
            <div className="min-h-[240px] overflow-auto rounded-2xl border border-slate-800 bg-[#070c16] p-4">
              {response === null ? <div className="grid min-h-[205px] place-items-center text-center"><div><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-slate-500"><ChevronDown size={20} /></div><p className="m-0 text-xs font-semibold text-slate-400">Response will appear here</p><p className="mb-0 mt-1 text-[10px] text-slate-600">Choose a file and send the request to see JSON.</p></div></div> : <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-6 text-emerald-300">{typeof response === "string" ? response : JSON.stringify(response, null, 2)}</pre>}
            </div>
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[10px] leading-5 text-slate-500">A successful upload returns <code className="text-cyan-300">file_id</code>, <code className="text-cyan-300">file_url</code>, filename, MIME type, byte size, workspace UUID, and SHA-256 checksum.</div>
          </div>
        </div> : <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="border-b border-slate-800 p-3 lg:border-b-0 lg:border-r">
            {apiEndpointDocs.map((doc, index) => <button key={doc.path} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selectedDoc === index ? "bg-indigo-500/10 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`} onClick={() => setSelectedDoc(index)}><span className={`w-12 rounded-md px-1.5 py-1 text-center font-mono text-[9px] font-bold ${doc.method === "POST" ? "bg-emerald-500/10 text-emerald-300" : "bg-cyan-500/10 text-cyan-300"}`}>{doc.method}</span><span className="min-w-0"><span className="block text-xs font-semibold">{doc.title}</span><span className="mt-1 block truncate font-mono text-[9px] text-slate-500">{doc.path}</span></span></button>)}
          </div>
          <div className="min-w-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-emerald-300">{currentDoc.method}</span><code className="break-all text-sm text-indigo-200">{currentDoc.path}</code></div>
            <h3 className="mb-1 mt-4 text-lg font-bold text-white">{currentDoc.title}</h3><p className="mt-0 text-xs leading-5 text-slate-400">{currentDoc.description}</p>
            <div className="mt-5 grid gap-4 xl:grid-cols-2"><CodeBlock title="Authentication & request" code={`${currentDoc.auth}\n\n${currentDoc.request}`} /><CodeBlock title="Example response" code={currentDoc.response} /></div>
            <a className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200" href={`${apiBaseUrl.replace(/\/$/, "")}/docs`} target="_blank" rel="noreferrer">Open full interactive OpenAPI docs <ChevronDown className="-rotate-90" size={14} /></a>
          </div>
        </div>}
      </section>
    </div>
  );
}

function InfoPill({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2.5"><div className="text-[9px] font-bold tracking-wide text-slate-500">{label}</div><div className={`mt-1 truncate text-[10px] font-semibold ${color}`} title={value}>{value}</div></div>;
}

function HeaderRow({ name, value }: { name: string; value: string }) {
  return <div className="mb-2 grid grid-cols-[120px_minmax(0,1fr)] gap-2"><code className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-[10px] text-indigo-300">{name}</code><code className="truncate rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-[10px] text-slate-400" title={value}>{value}</code></div>;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* Clipboard may be disabled by browser policy. */ }
  };
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#070c16]"><div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5"><span className="text-[10px] font-bold text-slate-400">{title}</span><button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white" onClick={() => void copy()} title="Copy example">{copied ? <Check size={13} /> : <Clipboard size={13} />}</button></div><pre className="m-0 overflow-x-auto whitespace-pre-wrap break-all p-3 font-mono text-[10px] leading-5 text-slate-300">{code}</pre></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition ${active ? "bg-indigo-500 text-white shadow" : "text-slate-400 hover:text-white"}`} onClick={onClick}>{children}</button>;
}
