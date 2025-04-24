import { useRef, useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { File, Image, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import fileTransfer from "../lib/fileTransfer";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [fileAttachment, setFileAttachment] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const { sendMessage } = useChatStore();
  const { selectedUser } = useChatStore();
  const { authUser } = useAuthStore();

  useEffect(() => {
    // Initialize file transfer and set up event listeners
    fileTransfer.init();
    
    const handleProgress = (data) => {
      setTransferProgress(data.progress);
    };
    
    const handleComplete = (data) => {
      setIsTransferring(false);
      setTransferProgress(0);
      toast.success("File sent successfully");
    };
    
    const handleError = (data) => {
      setIsTransferring(false);
      setTransferProgress(0);
      toast.error(`File transfer failed: ${data.error}`);
    };
    
    fileTransfer
      .on('progress', handleProgress)
      .on('complete', handleComplete)
      .on('error', handleError);
    
    return () => {
      fileTransfer
        .off('progress', handleProgress)
        .off('complete', handleComplete)
        .off('error', handleError);
    };
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setFileAttachment(null); // Remove any file attachment when image is selected
    };
    reader.readAsDataURL(file);
  };
  
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Limit file size to 100MB
    if (file.size > 100 * 1024 * 1024) {
      toast.error("File size exceeds 100MB limit");
      return;
    }
    
    setFileAttachment(file);
    setImagePreview(null); // Remove any image preview when file is selected
    toast.success(`File selected: ${file.name}`);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };
  
  const removeFile = () => {
    setFileAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview && !fileAttachment) return;

    try {
      if (fileAttachment) {
        // Send file using file transfer module
        setIsTransferring(true);
        setTransferProgress(0);
        
        // Send a message about the file
        await sendMessage({
          text: `Sending file: ${fileAttachment.name} (${(fileAttachment.size / 1024).toFixed(2)} KB)`,
        });
        
        // Start file transfer in background
        fileTransfer.sendFile(fileAttachment, selectedUser._id);
      } else {
        // Send regular message with optional image
        await sendMessage({
          text: text.trim(),
          image: imagePreview,
        });
      }

      // Clear form
      setText("");
      setImagePreview(null);
      setFileAttachment(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsTransferring(false);
    }
  };

  return (
    <div className="p-4 w-full">
      {imagePreview && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
      
      {fileAttachment && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative bg-base-200 p-2 rounded-lg border border-zinc-700 flex items-center gap-2">
            <File className="size-5 text-primary" />
            <span className="text-sm truncate max-w-[150px]">{fileAttachment.name}</span>
            <span className="text-xs text-zinc-400">({(fileAttachment.size / 1024).toFixed(2)} KB)</span>
            <button
              onClick={removeFile}
              className="w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center ml-1"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
      
      {isTransferring && (
        <div className="mb-3">
          <div className="w-full bg-base-200 rounded-full h-2.5">
            <div 
              className="bg-primary h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${transferProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-center mt-1">Transferring file: {transferProgress}%</p>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            className="w-full input input-bordered rounded-lg input-sm sm:input-md"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isTransferring}
          />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={imageInputRef}
            onChange={handleImageChange}
          />
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className={`hidden sm:flex btn btn-circle
                     ${imagePreview ? "text-emerald-500" : "text-zinc-400"}`}
            onClick={() => imageInputRef.current?.click()}
            disabled={isTransferring || fileAttachment !== null}
          >
            <Image size={20} />
          </button>
          
          <button
            type="button"
            className={`hidden sm:flex btn btn-circle
                     ${fileAttachment ? "text-emerald-500" : "text-zinc-400"}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isTransferring || imagePreview !== null}
          >
            <File size={20} />
          </button>
        </div>
        <button
          type="submit"
          className="btn btn-sm btn-circle"
          disabled={isTransferring || (!text.trim() && !imagePreview && !fileAttachment)}
        >
          <Send size={22} />
        </button>
      </form>
    </div>
  );
};
export default MessageInput;
