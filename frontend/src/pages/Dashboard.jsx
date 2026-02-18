import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Image, Eye, Trash2, Plus } from "lucide-react";
import toast from "react-hot-toast";

import Button from "../components/ui/Button";
import FilePreviewModal from "../components/dashboard/FilePreviewModal";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const Dashboard = () => {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);

  const processFiles = useCallback(
    (incoming) => {
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
        // Avoid duplicates
        if (files.some((f) => f.name === file.name && f.size === file.size)) {
          toast.error(`"${file.name}" already added`);
          continue;
        }
        valid.push(file);
      }

      if (valid.length) {
        setFiles((prev) => [...prev, ...valid]);
        toast.success(`${valid.length} file(s) added`);
      }
    },
    [files]
  );

  // Drag events
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
    e.target.value = ""; // reset so same file can be re-selected
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    toast.success("File removed");
  };

  const getFilePreviewUrl = (file) => URL.createObjectURL(file);

  const isImage = (file) => file.type.startsWith("image/");

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
        `}
        onClick={() => fileInputRef.current?.click()}
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
          <div
            className={`p-4 rounded-2xl transition-colors ${
              dragActive
                ? "bg-primary-200/50 text-primary-600"
                : "bg-surface-100 text-surface-400"
            }`}
          >
            <Upload size={32} />
          </div>
          <div>
            <p className="text-sm font-medium text-surface-700">
              {dragActive
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
      {files.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-800">
              Uploaded Files ({files.length})
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={14} />
              Add more
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="group relative bg-white/70 backdrop-blur-sm rounded-xl border border-surface-200 overflow-hidden hover:shadow-md hover:shadow-primary-200/20 transition-all duration-200"
              >
                {/* Preview thumbnail */}
                <div className="relative h-44 bg-surface-50 flex items-center justify-center overflow-hidden">
                  {isImage(file) ? (
                    <img
                      src={getFilePreviewUrl(file)}
                      alt={file.name}
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
                        setPreviewFile(file);
                      }}
                      className="p-2 bg-white/90 rounded-xl text-surface-700 hover:bg-white transition-colors cursor-pointer"
                      title="Preview"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
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
                  {isImage(file) ? (
                    <Image size={14} className="text-primary-500 shrink-0" />
                  ) : (
                    <FileText size={14} className="text-accent-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-surface-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex p-4 rounded-2xl bg-surface-100 text-surface-300 mb-4">
            <Image size={40} />
          </div>
          <p className="text-surface-500 text-sm">
            No warranty documents yet. Upload your first file above.
          </p>
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
