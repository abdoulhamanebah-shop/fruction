import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// Connexion au serveur (en production ou local)
const socket = io.connect(import.meta.env.VITE_SERVER_URL || "http://localhost:3001");

function App() {
  // --- ÉTATS AUTHENTIFICATION ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authData, setAuthData] = useState({ email: '', password: '', username: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState('');

  // --- ÉTATS CHAT ---
  const [allUsers, setAllUsers] = useState([]); 
  const [onlineUsers, setOnlineUsers] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [messageList, setMessageList] = useState([]);
  const [message, setMessage] = useState("");

  // 1. Gestion de l'utilisateur et de la liste
  useEffect(() => {
    socket.emit('get_all_users');
    
    socket.on('all_users_list', (users) => {
        setAllUsers(users);
    });

    socket.on('login_success', (data) => {
        setCurrentUser(data.username);
        setIsAuthenticated(true);
        socket.emit('join_user', data.username);
        socket.emit('get_all_users'); 
    });

    socket.on('login_fail', (data) => {
        setAuthError(data.message);
        setAuthSuccess('');
    });

    socket.on('register_response', (data) => {
        if(data.success) {
            setAuthSuccess(data.message);
            setAuthError('');
        } else {
            setAuthError(data.message);
        }
    });

    socket.on('update_online_users', (users) => {
        setOnlineUsers(users);
    });

    return () => {
        socket.off('all_users_list');
        socket.off('login_success');
        socket.off('login_fail');
        socket.off('register_response');
        socket.off('update_online_users');
    };
  }, []);

  const handleAuthSubmit = () => {
    setAuthError('');
    setAuthSuccess('');
    if (isRegisterMode) {
        if(!authData.username || !authData.email || !authData.password) {
            setAuthError("Tous les champs sont requis.");
            return;
        }
        socket.emit('register', authData);
    } else {
        if(!authData.email || !authData.password) {
            setAuthError("Email et mot de passe requis.");
            return;
        }
        socket.emit('login_auth', { email: authData.email, password: authData.password });
    }
  };

  // 2. Charger l'historique quand on change de contact
  useEffect(() => {
    if (selectedUser) {
      socket.emit("get_history", { sender: currentUser, receiver: selectedUser.username });
    }
  }, [selectedUser, currentUser]);

  useEffect(() => {
    socket.on("load_history", (history) => {
      setMessageList(history);
    });
    return () => { socket.off("load_history"); };
  }, []);

  // 3. Envoyer message
  const sendMessage = async () => {
    if (message !== "" && selectedUser) {
      const messageData = {
        sender: currentUser,
        receiver: selectedUser.username,
        message: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setMessage("");
    }
  };

  useEffect(() => {
    socket.on("receive_message", (data) => {
      if (selectedUser && data.sender === selectedUser.username) {
        setMessageList((list) => [...list, data]);
      }
    });
  }, [socket, selectedUser]);

  // 4. Filtre pour la recherche
  const filteredUsers = allUsers.filter((u) => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) && u.username !== currentUser
  );

  return (
    <div className="app-container">
      
      {/* --- ÉCRAN DE CONNEXION --- */}
      {!isAuthenticated && (
        <div className="auth-container">
            <div className="auth-box">
                <h1>Fruction</h1>
                <div className="auth-tabs">
                    <button 
                        className={!isRegisterMode ? "active" : ""} 
                        onClick={() => {setIsRegisterMode(false); setAuthError(''); setAuthSuccess('');}}
                    >
                        Connexion
                    </button>
                    <button 
                        className={isRegisterMode ? "active" : ""} 
                        onClick={() => {setIsRegisterMode(true); setAuthError(''); setAuthSuccess('');}}
                    >
                        Inscription
                    </button>
                </div>

                {authError && <p className="error-msg">{authError}</p>}
                {authSuccess && <p className="success-msg">{authSuccess}</p>}

                <div className="auth-inputs">
                    {isRegisterMode && (
                        <input 
                            type="text" 
                            placeholder="Pseudo..." 
                            value={authData.username}
                            onChange={(e) => setAuthData({...authData, username: e.target.value})} 
                        />
                    )}
                    <input 
                        type="email" 
                        placeholder="Email..." 
                        value={authData.email}
                        onChange={(e) => setAuthData({...authData, email: e.target.value})} 
                    />
                    <input 
                        type="password" 
                        placeholder="Mot de passe..." 
                        value={authData.password}
                        onChange={(e) => setAuthData({...authData, password: e.target.value})} 
                    />
                </div>
                <button className="main-btn" onClick={handleAuthSubmit}>
                    {isRegisterMode ? "Créer mon compte" : "Se connecter"}
                </button>
            </div>
        </div>
      )}

      {/* --- INTERFACE PRINCIPALE --- */}
      {isAuthenticated && (
        <div className="main-layout">
          
          {/* SIDEBAR (LISTE DES CONTACTS) */}
          <div className="sidebar">
            <div className="sidebar-header">
              <h1>Fruction</h1>
              <div className="user-badge">{currentUser}</div>
            </div>

            <div className="search-container">
              <input 
                type="text" 
                placeholder="Rechercher..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="contacts-list">
              {filteredUsers.length === 0 && <p className="no-contacts">Aucun contact enregistré...</p>}
              {filteredUsers.map((user, index) => {
                const isOnline = onlineUsers.some(u => u.username === user.username);

                return (
                  <div 
                    key={index} 
                    className={`contact-item ${selectedUser && selectedUser.username === user.username ? 'active' : ''}`}
                    onClick={() => setSelectedUser(user)}
                  >
                    <div className="avatar">
                        {user.username[0].toUpperCase()}
                        {isOnline && <span className="online-dot"></span>}
                    </div>
                    <div className="contact-info">
                      <strong>{user.username}</strong>
                      <span>{isOnline ? "En ligne" : "Hors ligne"}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ZONE DE CHAT */}
          <div className="chat-area">
            {selectedUser ? (
              <>
                <header className="chat-header">
                  {/* Bouton Retour pour Mobile */}
                  <button className="mobile-back-btn" onClick={() => setSelectedUser(null)}>←</button>
                  
                  <div className="header-avatar">{selectedUser.username[0].toUpperCase()}</div>
                  <div className="header-info">
                    <h3>{selectedUser.username}</h3>
                  </div>
                </header>

                <div className="messages-container">
                  {messageList.map((msg, index) => (
                    <div key={index} className={`message ${msg.sender === currentUser ? 'sent' : 'received'}`}>
                      <div className="bubble">{msg.message}</div>
                      <span className="time">{msg.time}</span>
                    </div>
                  ))}
                </div>

                <div className="input-area">
                  <input 
                    type="text" 
                    placeholder="Écrire..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') sendMessage() }}
                  />
                  <button onClick={sendMessage}>➤</button>
                </div>
              </>
            ) : (
              <div className="no-chat-selected">
                <h1>Fruction</h1>
                <p>Sélectionnez une conversation.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;