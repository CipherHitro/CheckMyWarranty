import { useEffect } from "react";
import { X, Download, FileText } from "lucide-react";

const FilePreviewModal = ({ file, backendUrl, onClose }) => {
  // file is now a document object from the DB: { id, file_url, original_filename, expiry_date, ... }
  const url = `${backendUrl}${file.file_url}`;
  const name = file.original_filename || "file";
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(name);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.target = "_blank";
    link.click();
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <div className="flex items-center gap-2 min-w-0">
            {isImage ? (
              <span className="w-2 h-2 rounded-full bg-primary-400" />
            ) : (
              <FileText size={16} className="text-accent-500" />
            )}
            <h3 className="text-sm font-semibold text-surface-800 truncate">
              {name}
            </h3>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors cursor-pointer"
              title="Download"
            >
              <Download size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors cursor-pointer"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-surface-50 flex items-center justify-center p-4">
          {isImage ? (
            <img
              src={url}
              alt={name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : (
            <iframe
              src={url}
              title={name}
              className="w-full h-[70vh] rounded-lg border border-surface-200"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
