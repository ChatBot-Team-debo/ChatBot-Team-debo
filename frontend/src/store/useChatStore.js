import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import networkManager from "../lib/networking";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      // Send typing indicator via UDP (faster, less reliable)
      networkManager.sendUdpMessage({
        type: "typing",
        receiverId: selectedUser._id,
        senderId: useAuthStore.getState().authUser._id
      });
      
      // Send actual message via TCP (reliable delivery)
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      
      // Also send through network manager for TCP delivery
      networkManager.sendTcpMessage({
        type: "newMessage",
        message: res.data
      });
      
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    
    // Message handler function
    const messageHandler = (message) => {
      // Handle different message types
      if (message.type === "newMessage") {
        const newMessage = message.message;
        const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
        if (!isMessageSentFromSelectedUser) return;

        set({
          messages: [...get().messages, newMessage],
        });
      } else if (message.type === "typing") {
        // Handle typing indicators
        if (message.senderId === selectedUser._id) {
          // Update UI to show typing indicator
          // This could be implemented with a new state variable
        }
      }
    };
    
    // Register message handler with network manager
    networkManager.onMessage(messageHandler);
    
    // Store the handler reference for later removal
    set({ currentMessageHandler: messageHandler });
  },

  unsubscribeFromMessages: () => {
    const { currentMessageHandler } = get();
    if (currentMessageHandler) {
      networkManager.offMessage(currentMessageHandler);
    }
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
