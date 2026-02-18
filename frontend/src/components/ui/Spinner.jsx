import { Loader2 } from "lucide-react";

const Spinner = ({ size = 32, className = "" }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 size={size} className="animate-spin text-primary-500" />
    </div>
  );
};

export default Spinner;
