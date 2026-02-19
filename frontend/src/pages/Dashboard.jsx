import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, Image, Eye, Trash2, Plus, Calendar } from "lucide-react";
import toast from "react-hot-toast";

import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const Dashboard = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // ── Fetch all documents from backend ──────────────────────────
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/data/getAll`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Failed to fetch documents");

      setDocuments(data.documents);
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error(err.message || "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on first render
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Poll for pending extractions ──────────────────────────────
  // If any document still has expiry_date === null, re-fetch every 4s
  useEffect(() => {
    const hasPending = documents.some((d) => !d.expiry_date);
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 4000);

    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  // ── Upload file to backend ────────────────────────────────────
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/data/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Upload failed");
    return data.document;
  };

  const processFiles = useCallback(
    async (incoming) => {
      const valid = [];

      for (const file of incoming) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error(`"${file.name}" — unsupported file type`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" exceeds 10 MB limit`);
          continue;
        }
        if (
          documents.some((d) => d.original_filename === file.name)
        ) {
          toast.error(`"${file.name}" already uploaded`);
          continue;
        }
        valid.push(file);
      }

      if (!valid.length) return;

      setUploading(true);

      for (const file of valid) {
        try {
          await uploadFile(file);
          toast.success(`"${file.name}" uploaded`);
        } catch (err) {
          toast.error(`"${file.name}" — ${err.message}`);
        }
      }

      // Re-fetch all documents after uploads
      await fetchDocuments();
      setUploading(false);
    },
    [documents, fetchDocuments]
  );

  // ── Remove file via backend ───────────────────────────────────
  const removeFile = async (documentId) => {

    try {
      if(!confirm("Do you really want to delete this file?")){
        return
      }
      const res = await fetch(`${API_URL}/data/remove`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Remove failed");

      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      toast.success("File removed");
    } catch (err) {
      console.error("Remove error:", err);
      toast.error(err.message || "Could not remove file");
    }
  };

  // ── Drag & drop events ────────────────────────────────────────
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      processFiles([...e.dataTransfer.files]);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files?.length) {
      processFiles([...e.target.files]);
    }
    e.target.value = "";
  };

  // ── Helpers ───────────────────────────────────────────────────
  const getFullUrl = (fileUrl) =>
    fileUrl.startsWith("http") ? fileUrl : `${BACKEND_URL}${fileUrl}`;

  const isImage = (doc) => {
    const name = doc.original_filename?.toLowerCase() || "";
    return /\.(jpe?g|png|webp|gif)$/i.test(name);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-800">Dashboard</h1>
        <p className="text-surface-500 text-sm mt-1">
          Upload and manage your warranty documents
        </p>
      </div>

      {/* Upload area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`
          relative rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer
          ${
            dragActive
              ? "border-primary-400 bg-primary-50/50"
              : "border-surface-300 bg-white/50 hover:border-primary-300 hover:bg-primary-50/30"
          }
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <Spinner size={32} />
          ) : (
            <div
              className={`p-4 rounded-2xl transition-colors ${
                dragActive
                  ? "bg-primary-200/50 text-primary-600"
                  : "bg-surface-100 text-surface-400"
              }`}
            >
              <Upload size={32} />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-surface-700">
              {uploading
                ? "Uploading..."
                : dragActive
                ? "Drop files here"
                : "Drag & drop files, or click to browse"}
            </p>
            <p className="text-xs text-surface-400 mt-1">
              JPEG, PNG, WebP, GIF, PDF — up to 10 MB each
            </p>
          </div>
        </div>
      </div>

      {/* File grid */}
      {documents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-800">
              Uploaded Files ({documents.length})
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Plus size={14} />
              Add more
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group relative bg-white/70 backdrop-blur-sm rounded-xl border border-surface-200 overflow-hidden hover:shadow-md hover:shadow-primary-200/20 transition-all duration-200"
              >
                {/* Preview thumbnail */}
                <div className="relative h-44 bg-surface-50 flex items-center justify-center overflow-hidden">
                  {isImage(doc) ? (
                    <img
                      src={getFullUrl(doc.file_url)}
                      alt={doc.original_filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-surface-400">
                      <FileText size={40} />
                      <span className="text-xs font-medium uppercase">PDF</span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-surface-900/0 group-hover:bg-surface-900/40 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(getFullUrl(doc.file_url), "_blank");
                      }}
                      className="p-2 bg-white/90 rounded-xl text-surface-700 hover:bg-white transition-colors cursor-pointer"
                      title="Open in new tab"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(doc.id);
                      }}
                      className="p-2 bg-white/90 rounded-xl text-red-500 hover:bg-white transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* File info */}
                <div className="px-4 py-3 flex items-center gap-2">
                  {isImage(doc) ? (
                    <Image size={14} className="text-primary-500 shrink-0" />
                  ) : (
                    <FileText size={14} className="text-accent-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700 truncate">
                      {doc.original_filename}
                    </p>
                    <p className="text-xs text-surface-400 flex items-center gap-1">
                      <Calendar size={10} />
                      {doc.expiry_date
                        ? `Expires ${formatDate(doc.expiry_date)}`
                        : <span className="text-amber-500 animate-pulse">Extracting…</span>
                      }
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex p-4 rounded-2xl bg-surface-100 text-surface-300 mb-4">
            <Image size={40} />
          </div>
          <p className="text-surface-500 text-sm">
            No warranty documents yet. Upload your first file above.
          </p>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
