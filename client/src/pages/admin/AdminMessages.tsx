/**
 * Tape'ā Back Office - Page Messages
 * Vue des conversations client/chauffeur
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, Send, Plus, User } from "lucide-react";

interface Conversation {
  id: string;
  orderId?: string | null;
  clientId?: string | null;
  driverId?: string | null;
  clientName?: string | null;
  driverName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number | null;
}

interface MessageItem {
  id: string;
  senderType: "client" | "driver";
  content: string;
  createdAt: string;
}

interface SupportConversation {
  id: string;
  recipientType: "client" | "driver";
  recipientId: string;
  recipientName: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
}

interface SupportMessageItem {
  id: string;
  senderType: "admin" | "client" | "driver";
  content: string;
  createdAt: string;
}

interface UserOption {
  id: string;
  name: string;
  phone?: string | null;
}

interface OrderOption {
  orderId: string;
  clientId?: string | null;
  clientName?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

export function AdminMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [supportConversations, setSupportConversations] = useState<SupportConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSupportConversations, setIsLoadingSupportConversations] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadFilter, setUnreadFilter] = useState<"all" | "unread" | "read">("all");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedSupportConversation, setSelectedSupportConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingSupportMessages, setIsLoadingSupportMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [recipientType, setRecipientType] = useState<"client" | "driver">("client");
  const [isSending, setIsSending] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newRecipientType, setNewRecipientType] = useState<"client" | "driver">("client");
  const [newUsers, setNewUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userOrders, setUserOrders] = useState<OrderOption[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [directMessage, setDirectMessage] = useState("");
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const conversationsSigRef = useRef<string | null>(null);
  const supportConversationsSigRef = useRef<string | null>(null);
  const messagesSigRef = useRef<string | null>(null);
  const supportMessagesSigRef = useRef<string | null>(null);

  useEffect(() => {
    fetchConversations();
    fetchSupportConversations();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations({ silent: true });
      fetchSupportConversations({ silent: true });
      if (selectedConversation?.orderId) {
        fetchConversationMessages(selectedConversation.orderId, { silent: true });
      }
      if (selectedSupportConversation) {
        fetchSupportConversationMessages(
          selectedSupportConversation.recipientType,
          selectedSupportConversation.recipientId,
          { silent: true }
        );
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedConversation?.orderId, selectedSupportConversation]);

  useEffect(() => {
    if (showNewModal) {
      fetchUsers(newRecipientType);
    }
  }, [showNewModal, newRecipientType]);

  useEffect(() => {
    if (showNewModal && selectedUser) {
      fetchUserOrders(selectedUser.id, newRecipientType);
    } else {
      setUserOrders([]);
      setSelectedOrderId(null);
    }
  }, [showNewModal, selectedUser, newRecipientType]);

  useEffect(() => {
    if (!showNewModal) {
      setDirectMessage("");
    }
  }, [showNewModal]);

  async function fetchConversations(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsLoading(true);
    }
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/messages/conversations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const nextConversations = data.conversations || [];
        const nextSig = nextConversations
          .map((c: Conversation) => `${c.id}:${c.lastMessageAt || ""}:${c.unreadCount || 0}`)
          .join("|");
        if (nextSig !== conversationsSigRef.current) {
          conversationsSigRef.current = nextSig;
          setConversations(nextConversations);
        }
      } else {
        if (conversationsSigRef.current !== "") {
          conversationsSigRef.current = "";
          setConversations([]);
        }
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      if (conversationsSigRef.current !== "") {
        conversationsSigRef.current = "";
        setConversations([]);
      }
    } finally {
      if (!options.silent) {
        setIsLoading(false);
      }
    }
  }

  async function fetchSupportConversations(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsLoadingSupportConversations(true);
    }
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/messages/support/conversations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const nextConversations = data.conversations || [];
        const nextSig = nextConversations
          .map((c: SupportConversation) => `${c.id}:${c.lastMessageAt || ""}`)
          .join("|");
        if (nextSig !== supportConversationsSigRef.current) {
          supportConversationsSigRef.current = nextSig;
          setSupportConversations(nextConversations);
        }
      } else {
        if (supportConversationsSigRef.current !== "") {
          supportConversationsSigRef.current = "";
          setSupportConversations([]);
        }
      }
    } catch (error) {
      console.error("Error fetching support conversations:", error);
      if (supportConversationsSigRef.current !== "") {
        supportConversationsSigRef.current = "";
        setSupportConversations([]);
      }
    } finally {
      if (!options.silent) {
        setIsLoadingSupportConversations(false);
      }
    }
  }

  async function fetchUsers(type: "client" | "driver") {
    setIsLoadingUsers(true);
    try {
      const token = localStorage.getItem("admin_token");
      const endpoint = type === "client" ? "/api/admin/clients?limit=200&page=1" : "/api/admin/chauffeurs?limit=200&page=1";
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const list = (type === "client" ? data.clients : data.chauffeurs) || [];
        const mapped = list.map((item: any) => ({
          id: item.id,
          name: type === "client" ? `${item.firstName} ${item.lastName}` : `${item.firstName} ${item.lastName}`,
          phone: item.phone || null,
        }));
        setNewUsers(mapped);
      } else {
        setNewUsers([]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setNewUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function fetchUserOrders(userId: string, type: "client" | "driver") {
    setIsLoadingOrders(true);
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(
        `/api/admin/messages/orders?recipientType=${type}&recipientId=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const orders = (data.orders || []) as OrderOption[];
        setUserOrders(orders);
        setSelectedOrderId(orders[0]?.orderId || null);
      } else {
        setUserOrders([]);
        setSelectedOrderId(null);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setUserOrders([]);
      setSelectedOrderId(null);
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function fetchConversationMessages(orderId: string, options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsLoadingMessages(true);
    }
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/messages/order/${orderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const nextMessages = data.messages || [];
        const nextSig = nextMessages.map((m: MessageItem) => m.id).join("|");
        if (nextSig !== messagesSigRef.current) {
          messagesSigRef.current = nextSig;
          setMessages(nextMessages);
        }
      } else {
        if (messagesSigRef.current !== "") {
          messagesSigRef.current = "";
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      if (messagesSigRef.current !== "") {
        messagesSigRef.current = "";
        setMessages([]);
      }
    } finally {
      if (!options.silent) {
        setIsLoadingMessages(false);
      }
    }
  }

  async function fetchSupportConversationMessages(
    recipientType: "client" | "driver",
    recipientId: string,
    options: { silent?: boolean } = {}
  ) {
    if (!options.silent) {
      setIsLoadingSupportMessages(true);
    }
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(
        `/api/admin/messages/support?recipientType=${recipientType}&recipientId=${recipientId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const nextMessages = data.messages || [];
        const nextSig = nextMessages.map((m: SupportMessageItem) => m.id).join("|");
        if (nextSig !== supportMessagesSigRef.current) {
          supportMessagesSigRef.current = nextSig;
          setSupportMessages(nextMessages);
        }
      } else {
        if (supportMessagesSigRef.current !== "") {
          supportMessagesSigRef.current = "";
          setSupportMessages([]);
        }
      }
    } catch (error) {
      console.error("Error fetching support messages:", error);
      if (supportMessagesSigRef.current !== "") {
        supportMessagesSigRef.current = "";
        setSupportMessages([]);
      }
    } finally {
      if (!options.silent) {
        setIsLoadingSupportMessages(false);
      }
    }
  }

  function handleSelectConversation(conversation: Conversation) {
    setSelectedConversation(conversation);
    setSelectedSupportConversation(null);
    setRecipientType("client");
    setMessageInput("");
    if (conversation.orderId) {
      fetchConversationMessages(conversation.orderId);
    }
  }

  function handleSelectSupportConversation(conversation: SupportConversation) {
    setSelectedSupportConversation(conversation);
    setSelectedConversation(null);
    setRecipientType(conversation.recipientType);
    setMessageInput("");
    fetchSupportConversationMessages(conversation.recipientType, conversation.recipientId);
  }

  async function handleStartConversation() {
    if (!selectedUser) {
      alert("Sélectionne un utilisateur.");
      return;
    }
    if (!selectedOrderId) {
      alert("Aucune commande trouvée pour cet utilisateur.");
      return;
    }

    const order = userOrders.find((item) => item.orderId === selectedOrderId);
    if (!order) {
      alert("Commande introuvable.");
      return;
    }

    const conversation: Conversation = {
      id: order.orderId,
      orderId: order.orderId,
      clientId: order.clientId,
      driverId: order.driverId,
      clientName: order.clientName,
      driverName: order.driverName,
    };

    setShowNewModal(false);
    setSelectedUser(null);
    setUserSearchTerm("");
    setSelectedConversation(conversation);
    setRecipientType(newRecipientType);
    fetchConversationMessages(order.orderId);
  }

  async function handleSendMessage() {
    if (selectedSupportConversation) {
      const content = messageInput.trim();
      if (!content) return;

      setIsSending(true);
      try {
        const token = localStorage.getItem("admin_token");
        const response = await fetch("/api/admin/messages/direct", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipientType: selectedSupportConversation.recipientType,
            recipientId: selectedSupportConversation.recipientId,
            content,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.message) {
            setSupportMessages((prev) => [...prev, data.message]);
          } else {
            await fetchSupportConversationMessages(
              selectedSupportConversation.recipientType,
              selectedSupportConversation.recipientId
            );
          }
          setSupportConversations((prev) =>
            prev.map((item) =>
              item.id === selectedSupportConversation.id
                ? {
                    ...item,
                    lastMessage: content,
                    lastMessageAt: new Date().toISOString(),
                  }
                : item
            )
          );
          setMessageInput("");
        } else {
          const error = await response.json();
          alert(error.error || "Erreur lors de l'envoi du message.");
        }
      } catch (error) {
        console.error("Error sending support message:", error);
        alert("Erreur lors de l'envoi du message.");
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!selectedConversation?.orderId) return;
    const content = messageInput.trim();
    if (!content) return;

    if (recipientType === "client" && !selectedConversation.driverId) {
      alert("Aucun chauffeur assigné pour cette commande.");
      return;
    }

    if (recipientType === "driver" && !selectedConversation.driverId) {
      alert("Aucun chauffeur assigné pour cette commande.");
      return;
    }

    setIsSending(true);
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: selectedConversation.orderId,
          recipientType,
          content,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        setMessageInput("");
      } else {
        const error = await response.json();
        alert(error.error || "Erreur lors de l'envoi du message.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Erreur lors de l'envoi du message.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendDirectMessage() {
    if (!selectedUser) {
      alert("Sélectionne un utilisateur.");
      return;
    }
    const content = directMessage.trim();
    if (!content) {
      alert("Écris un message.");
      return;
    }

    setIsSendingDirect(true);
    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/messages/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientType: newRecipientType,
          recipientId: selectedUser.id,
          content,
        }),
      });

      if (response.ok) {
        setDirectMessage("");
        setShowNewModal(false);
        setSelectedUser(null);
        setUserSearchTerm("");
        fetchSupportConversations();
        alert("Message direct envoyé.");
      } else {
        const error = await response.json();
        alert(error.error || "Erreur lors de l'envoi du message direct.");
      }
    } catch (error) {
      console.error("Error sending direct message:", error);
      alert("Erreur lors de l'envoi du message direct.");
    } finally {
      setIsSendingDirect(false);
    }
  }

  async function handleDeleteSupportConversation() {
    if (!selectedSupportConversation) return;
    const confirmDelete = window.confirm(
      "Supprimer toute la conversation support ? Cette action est définitive."
    );
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(
        `/api/admin/messages/support?recipientType=${selectedSupportConversation.recipientType}&recipientId=${selectedSupportConversation.recipientId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSelectedSupportConversation(null);
        setSupportMessages([]);
        fetchSupportConversations();
      } else {
        const error = await response.json();
        alert(error.error || "Erreur lors de la suppression.");
      }
    } catch (error) {
      console.error("Error deleting support conversation:", error);
      alert("Erreur lors de la suppression.");
    }
  }

  async function handleDeleteOrderConversation() {
    if (!selectedConversation?.orderId) return;
    const confirmDelete = window.confirm(
      "Supprimer toute la conversation liée à cette commande ? Cette action est définitive."
    );
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/messages/order/${selectedConversation.orderId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setSelectedConversation(null);
        setMessages([]);
        fetchConversations();
      } else {
        const error = await response.json();
        alert(error.error || "Erreur lors de la suppression.");
      }
    } catch (error) {
      console.error("Error deleting order conversation:", error);
      alert("Erreur lors de la suppression.");
    }
  }

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesSearch =
        !term ||
        (conversation.clientName || "").toLowerCase().includes(term) ||
        (conversation.driverName || "").toLowerCase().includes(term) ||
        (conversation.orderId || "").toLowerCase().includes(term) ||
        (conversation.lastMessage || "").toLowerCase().includes(term);

      const isUnread = (conversation.unreadCount || 0) > 0;
      const matchesUnread =
        unreadFilter === "all" ||
        (unreadFilter === "unread" && isUnread) ||
        (unreadFilter === "read" && !isUnread);

      return matchesSearch && matchesUnread;
    });
  }, [conversations, searchTerm, unreadFilter]);

  const filteredSupportConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return supportConversations.filter((conversation) => {
      const matchesSearch =
        !term ||
        (conversation.recipientName || "").toLowerCase().includes(term) ||
        (conversation.lastMessage || "").toLowerCase().includes(term);
      return matchesSearch;
    });
  }, [supportConversations, searchTerm]);

  const orderedSupportMessages = useMemo(
    () =>
      [...supportMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [supportMessages]
  );

  const unreadCount = useMemo(
    () => conversations.filter((c) => (c.unreadCount || 0) > 0).length,
    [conversations]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
            <MessageCircle className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
            <p className="text-slate-500">Suivi des conversations client/chauffeur</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowNewModal(true);
              setNewRecipientType("client");
              setSelectedUser(null);
              setUserSearchTerm("");
              setDirectMessage("");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
          >
            <Plus className="h-4 w-4" />
            Nouveau message
          </button>
          <button
            onClick={() => {
              fetchConversations();
              fetchSupportConversations();
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Actualiser
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <MessageCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{conversations.length}</p>
              <p className="text-xs text-slate-500">Conversations</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <MessageCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{unreadCount}</p>
              <p className="text-xs text-slate-500">Non lus</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{supportConversations.length}</p>
              <p className="text-xs text-slate-500">Support direct</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Send className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{messages.length + supportMessages.length}</p>
              <p className="text-xs text-slate-500">Messages</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher client, chauffeur, message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
        </div>
        <select
          value={unreadFilter}
          onChange={(e) => setUnreadFilter(e.target.value as "all" | "unread" | "read")}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
        >
          <option value="all">Tous</option>
          <option value="unread">Non lus</option>
          <option value="read">Lus</option>
        </select>
      </div>

      {/* Support direct */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-2">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Support direct</h2>
              <p className="text-sm text-slate-500">Messages envoyés par les clients/chauffeurs</p>
            </div>
          </div>
        </div>
        
        {/* Vue Mobile - Cartes */}
        <div className="md:hidden p-4 space-y-3">
          {isLoadingSupportConversations ? (
            <div className="py-8 text-center text-gray-500">Chargement...</div>
          ) : filteredSupportConversations.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Aucun message support</div>
          ) : (
            filteredSupportConversations.map((conversation) => (
              <div key={conversation.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      conversation.recipientType === "client" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {conversation.recipientType === "client" ? "Client" : "Chauffeur"}
                    </span>
                    <p className="font-medium text-gray-900 mt-1">{conversation.recipientName || "Utilisateur"}</p>
                  </div>
                  <button
                    onClick={() => handleSelectSupportConversation(conversation)}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Ouvrir
                  </button>
                </div>
                <p className="text-sm text-gray-600 truncate">{conversation.lastMessage || "—"}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString("fr-FR") : "—"}
                </p>
              </div>
            ))
          )}
        </div>
        
        {/* Vue Desktop - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Destinataire</th>
                <th className="px-6 py-4">Dernier message</th>
                <th className="px-6 py-4">Dernière activité</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingSupportConversations ? (
                <tr>
                  <td className="px-6 py-8 text-center text-gray-500" colSpan={5}>
                    Chargement des conversations support...
                  </td>
                </tr>
              ) : filteredSupportConversations.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan={5}>
                    Aucun message support pour le moment.
                  </td>
                </tr>
              ) : (
                filteredSupportConversations.map((conversation) => (
                  <tr key={conversation.id} className="border-t">
                    <td className="px-6 py-4 text-gray-700">
                      {conversation.recipientType === "client" ? "Client" : "Chauffeur"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {conversation.recipientName || "Utilisateur"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {conversation.lastMessage || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {conversation.lastMessageAt
                        ? new Date(conversation.lastMessageAt).toLocaleString("fr-FR")
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSelectSupportConversation(conversation)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversations Client/Chauffeur */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {/* Vue Mobile - Cartes */}
        <div className="md:hidden p-4 space-y-3">
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Chargement...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Aucune conversation</div>
          ) : (
            filteredConversations.map((conversation) => (
              <div key={conversation.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{conversation.clientName || "Client"}</p>
                    <p className="text-sm text-gray-500">{conversation.driverName || "Chauffeur"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversation.unreadCount ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                    <button
                      onClick={() => handleSelectConversation(conversation)}
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Ouvrir
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 truncate">{conversation.lastMessage || "—"}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString("fr-FR") : "—"}
                </p>
              </div>
            ))
          )}
        </div>
        
        {/* Vue Desktop - Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Chauffeur</th>
                <th className="px-6 py-4">Dernier message</th>
                <th className="px-6 py-4">Commande</th>
                <th className="px-6 py-4 text-right">Non lus</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-6 py-8 text-center text-gray-500" colSpan={6}>
                    Chargement des conversations...
                  </td>
                </tr>
              ) : filteredConversations.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan={6}>
                    Aucune conversation disponible pour le moment.
                  </td>
                </tr>
              ) : (
                filteredConversations.map((conversation) => (
                  <tr key={conversation.id} className="border-t">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {conversation.clientName || "Client"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {conversation.lastMessageAt
                          ? new Date(conversation.lastMessageAt).toLocaleString("fr-FR")
                          : "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {conversation.driverName || "Chauffeur"}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {conversation.lastMessage || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {conversation.orderId || "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {conversation.unreadCount ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          {conversation.unreadCount}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSelectConversation(conversation)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversation panel */}
      {selectedSupportConversation && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Support direct • {selectedSupportConversation.recipientName || "Utilisateur"}
              </h2>
              <p className="text-sm text-gray-500">
                Type : {selectedSupportConversation.recipientType === "client" ? "Client" : "Chauffeur"}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-4">
              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
                {isLoadingSupportMessages ? (
                  <p className="text-sm text-gray-500">Chargement des messages...</p>
                ) : orderedSupportMessages.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun message dans cette conversation.</p>
                ) : (
                  <div className="space-y-3">
                    {orderedSupportMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          message.senderType === "admin"
                            ? "bg-purple-50 text-purple-900"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>
                            {message.senderType === "admin"
                              ? "Support"
                              : message.senderType === "client"
                              ? "Client"
                              : "Chauffeur"}
                          </span>
                          <span>{new Date(message.createdAt).toLocaleString("fr-FR")}</span>
                        </div>
                        <p className="mt-1">{message.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Écrire un message..."
                  rows={3}
                  className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Envoyer
                </button>
              </div>
            </div>

            <div className="h-fit rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-800">Détails</div>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium text-gray-700">Destinataire :</span>{" "}
                  {selectedSupportConversation.recipientName || "Utilisateur"}
                </div>
                <div>
                  <span className="font-medium text-gray-700">Type :</span>{" "}
                  {selectedSupportConversation.recipientType === "client" ? "Client" : "Chauffeur"}
                </div>
                {selectedSupportConversation.lastMessageAt && (
                  <div>
                    <span className="font-medium text-gray-700">Dernier message :</span>{" "}
                    {new Date(selectedSupportConversation.lastMessageAt).toLocaleString("fr-FR")}
                  </div>
                )}
              </div>
              <div className="mt-4">
                <button
                  onClick={handleDeleteSupportConversation}
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                >
                  Supprimer la discussion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedConversation && !selectedSupportConversation && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Conversation • {selectedConversation.clientName || "Client"} ↔{" "}
                {selectedConversation.driverName || "Chauffeur"}
              </h2>
              <p className="text-sm text-gray-500">Commande : {selectedConversation.orderId}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-4">
              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
                {isLoadingMessages ? (
                  <p className="text-sm text-gray-500">Chargement des messages...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun message dans cette conversation.</p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          message.senderType === "client"
                            ? "bg-blue-50 text-blue-900"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>
                            {message.senderType === "client" ? "Client" : "Chauffeur"}
                          </span>
                          <span>{new Date(message.createdAt).toLocaleString("fr-FR")}</span>
                        </div>
                        <p className="mt-1">{message.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Écrire un message..."
                  rows={3}
                  className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Envoyer
                </button>
              </div>
            </div>

            <div className="h-fit rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-800">Options</div>
              <div className="mt-3 space-y-3">
                <div className="text-sm text-gray-600">
                  <div className="font-medium text-gray-700">Envoyer à</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setRecipientType("client")}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        recipientType === "client"
                          ? "border-purple-600 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Client
                    </button>
                    <button
                      onClick={() => setRecipientType("driver")}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        recipientType === "driver"
                          ? "border-purple-600 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Chauffeur
                    </button>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <div className="font-medium text-gray-700">Commande</div>
                  <div className="mt-1 text-gray-500">{selectedConversation.orderId}</div>
                </div>
                <div className="text-sm text-gray-600">
                  <div className="font-medium text-gray-700">Participants</div>
                  <div className="mt-1 text-gray-500">
                    {selectedConversation.clientName || "Client"} •{" "}
                    {selectedConversation.driverName || "Chauffeur"}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleDeleteOrderConversation}
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
                >
                  Supprimer la conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nouveau message</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Fermer
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Type</span>
                <button
                  onClick={() => {
                    setNewRecipientType("client");
                    setSelectedUser(null);
                    setSelectedOrderId(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    newRecipientType === "client"
                      ? "border-purple-600 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Client
                </button>
                <button
                  onClick={() => {
                    setNewRecipientType("driver");
                    setSelectedUser(null);
                    setSelectedOrderId(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    newRecipientType === "driver"
                      ? "border-purple-600 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Chauffeur
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="Rechercher un utilisateur..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                {isLoadingUsers ? (
                  <div className="p-4 text-sm text-gray-500">Chargement...</div>
                ) : newUsers.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">Aucun utilisateur trouvé.</div>
                ) : (
                  newUsers
                    .filter((user) =>
                      `${user.name} ${user.phone || ""}`.toLowerCase().includes(userSearchTerm.toLowerCase())
                    )
                    .map((user) => (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                          selectedUser?.id === user.id
                            ? "bg-purple-50 text-purple-700"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 p-2">
                            <User className="h-4 w-4 text-gray-500" />
                          </span>
                          <span>
                            <div className="font-medium text-gray-900">{user.name}</div>
                            {user.phone && <div className="text-xs text-gray-500">{user.phone}</div>}
                          </span>
                        </span>
                        {selectedUser?.id === user.id && (
                          <span className="text-xs font-semibold text-purple-600">Sélectionné</span>
                        )}
                      </button>
                    ))
                )}
              </div>

              {selectedUser && (
                <div className="space-y-3 rounded-lg border border-dashed border-purple-200 bg-purple-50/40 p-4">
                  <div className="text-sm font-medium text-purple-700">Message direct (sans commande)</div>
                  <textarea
                    value={directMessage}
                    onChange={(e) => setDirectMessage(e.target.value)}
                    placeholder={
                      newRecipientType === "driver"
                        ? "Écrire un message direct au chauffeur..."
                        : "Écrire un message direct au client..."
                    }
                    rows={4}
                    className="w-full resize-none rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                  <button
                    onClick={handleSendDirectMessage}
                    disabled={isSendingDirect}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    Envoyer un message direct
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Commande</div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {isLoadingOrders ? (
                    <div className="p-4 text-sm text-gray-500">Chargement des commandes...</div>
                  ) : userOrders.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">
                      Aucune commande trouvée pour cet utilisateur.
                    </div>
                  ) : (
                    userOrders.map((order) => (
                      <button
                        key={order.orderId}
                        onClick={() => setSelectedOrderId(order.orderId)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                          selectedOrderId === order.orderId
                            ? "bg-purple-50 text-purple-700"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {order.clientName || "Client"} • {order.driverName || "Chauffeur"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString("fr-FR")
                              : "Date inconnue"}{" "}
                            • {order.status || "statut"}
                          </div>
                        </div>
                        {selectedOrderId === order.orderId && (
                          <span className="text-xs font-semibold text-purple-600">Sélectionné</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleStartConversation}
                  disabled={!selectedOrderId || userOrders.length === 0}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continuer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
