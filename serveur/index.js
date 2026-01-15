require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Configuration Socket.io pour accepter Vercel et Localhost
const io = new Server(server, {
  cors: {
    origin: "*", // Autorise toutes les connexions
    methods: ["GET", "POST"]
  }
});

// --- CONNEXION À MONGODB ---
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => {
      console.error("❌ Erreur de connexion MongoDB:", err);
      process.exit(1); // Arrête le serveur si la base de données échoue
  });

// --- MODÈLES DE DONNÉES (SCHÉMAS) ---
const UserSchema = new mongoose.Schema({ 
    username: String, 
    email: String, 
    password: String, 
    joinedAt: Date 
});

const MessageSchema = new mongoose.Schema({ 
    sender: String, 
    receiver: String, 
    message: String, 
    time: String 
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// --- VARIABLES TEMPORAIRES (En ligne) ---
let onlineUsers = [];

// --- LOGIQUE SOCKET.IO ---
async function startServer() {
    try {
        io.on('connection', (socket) => {
            console.log(`Nouvelle connexion socket : ${socket.id}`);

            // 1. Demande de la liste de tous les utilisateurs
            socket.on('get_all_users', async () => {
                try {
                    const users = await User.find({});
                    socket.emit('all_users_list', users);
                } catch (error) {
                    console.error("Erreur get_all_users:", error);
                }
            });

            // 2. Inscription (Création de compte)
            socket.on('register', async (data) => {
                try {
                    console.log("🔥 TENTATIVE D'INSCRIPTION REÇUE :", data);
                    
                    const { username, email, password } = data;
                    
                    // Vérifier si l'email existe déjà
                    const existingEmail = await User.findOne({ email });
                    if (existingEmail) {
                        return socket.emit('register_response', { success: false, message: "Cet email est déjà utilisé." });
                    }
                    
                    // Vérifier si le pseudo est pris
                    const existingName = await User.findOne({ username });
                    if (existingName) {
                        return socket.emit('register_response', { success: false, message: "Ce pseudo est déjà pris." });
                    }

                    // Créer et sauvegarder le nouveau compte
                    const newUser = new User({ username, email, password, joinedAt: new Date() });
                    await newUser.save();
                    
                    console.log("✅ Compte créé pour :", username);
                    socket.emit('register_response', { success: true, message: "Compte créé avec succès !" });
                } catch (error) {
                    console.error("Erreur register:", error);
                    socket.emit('register_response', { success: false, message: "Erreur serveur." });
                }
            });

            // 3. Login Auth (Vérification MDP)
            socket.on('login_auth', async (data) => {
                try {
                    console.log("🔥 TENTATIVE DE LOGIN REÇUE :", data);
                    
                    const { email, password } = data;
                    
                    const user = await User.findOne({ email, password });
                    
                    if (user) {
                        console.log("✅ Login réussi pour :", user.username);
                        socket.emit('login_success', { username: user.username });
                    } else {
                        console.log("❌ Login échoué");
                        socket.emit('login_fail', { message: "Email ou mot de passe incorrect." });
                    }
                } catch (error) {
                    console.error("Erreur login:", error);
                    socket.emit('login_fail', { message: "Erreur serveur." });
                }
            });

            // 4. Rejoindre le chat (Après login réussi)
            socket.on('join_user', (username) => {
                const user = { socketId: socket.id, username: username };
                onlineUsers.push(user);
                io.emit('update_online_users', onlineUsers);
                console.log(`Utilisateur ${username} a rejoint le chat.`);
            });

            // 5. Charger l'historique des messages
            socket.on('get_history', async (data) => {
                try {
                    const { sender, receiver } = data;
                    const history = await Message.find({
                        $or: [
                            { sender: sender, receiver: receiver },
                            { sender: receiver, receiver: sender }
                        ]
                    });
                    socket.emit('load_history', history);
                } catch (error) {
                    console.error("Erreur get_history:", error);
                }
            });

            // 6. Envoyer un message
            socket.on('send_message', async (data) => {
                try {
                    const { sender, receiver, message, time } = data;
                    
                    // Sauvegarder dans MongoDB
                    const newMessage = new Message({ sender, receiver, message, time });
                    await newMessage.save();

                    // Envoyer au destinataire s'il est en ligne
                    const receiverUser = onlineUsers.find((user) => user.username === receiver);
                    if (receiverUser) {
                        io.to(receiverUser.socketId).emit('receive_message', data);
                    }
                } catch (error) {
                    console.error("Erreur send_message:", error);
                }
            });

            // 7. Déconnexion
            socket.on('disconnect', () => {
                onlineUsers = onlineUsers.filter((user) => user.socketId !== socket.id);
                io.emit('update_online_users', onlineUsers);
                console.log('Un utilisateur s\'est déconnecté');
            });
        });

        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => {
          console.log(`✅ SERVEUR FRUCTION ACTIF sur le port ${PORT}`);
        });

    } catch (error) {
        console.error("Erreur serveur fatale:", error);
    }
}

startServer();