import { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import ChatBot from "../chat/ChatBot";

const DashboardLayout = () => {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-primary-100">
      <Navbar onOpenChat={() => setChatOpen(true)} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      <ChatBot open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

export default DashboardLayout;