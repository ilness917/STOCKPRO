// Sistema de Autenticação StockPro

// Estado de autenticação
let authState = {
    isAuthenticated: false,
    currentUser: null,
    sessionToken: null
};

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
});

async function initializeAuth() {
    // Verificar se há sessão ativa
    const savedSession = localStorage.getItem('stockpro_session');
    if (savedSession) {
        try {
            const sessionData = JSON.parse(savedSession);
            if (isSessionValid(sessionData)) {
                authState = sessionData;
                redirectToApp();
                return;
            } else {
                localStorage.removeItem('stockpro_session');
            }
        } catch (error) {
            console.error('Erro ao recuperar sessão:', error);
            localStorage.removeItem('stockpro_session');
        }
    }
    
    // Configurar event listeners
    setupAuthEventListeners();
    
    // Verificar se é primeiro acesso (criar usuário admin)
    await checkFirstAccess();
}

function setupAuthEventListeners() {
    // Toggle password visibility
    document.getElementById('toggle-password').addEventListener('click', function() {
        const passwordInput = document.getElementById('password');
        const icon = this.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    });
    
    // Remover funcionalidade de alternância (não há mais formulário de registro público)
    
    // Login form submission
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Registro público removido - apenas admins podem criar usuários
    
    // Demo login
    document.getElementById('demo-login').addEventListener('click', handleDemoLogin);
    
    // Validação de senha removida junto com formulário de registro
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    showLoginLoading(true);
    
    try {
        const user = await authenticateUser(email, password);
        
        if (user) {
            await createSession(user, rememberMe);
            showNotification('Login realizado com sucesso!', 'success');
            redirectToApp();
        } else {
            showNotification('Email ou senha incorretos', 'error');
        }
    } catch (error) {
        console.error('Erro no login:', error);
        showNotification('Erro ao fazer login. Tente novamente.', 'error');
    } finally {
        showLoginLoading(false);
    }
}

// Função de registro removida - apenas admins podem criar usuários no sistema principal

async function handleDemoLogin() {
    showLoading(true);
    
    try {
        // Criar usuário demo se não existir
        let demoUser = await findUserByEmail('demo@stockpro.com');
        
        if (!demoUser) {
            demoUser = await createUser({
                nome: 'Usuário Demo',
                email: 'demo@stockpro.com',
                cargo: 'Administrador',
                perfil: 'admin',
                password: 'demo123'
            });
        }
        
        if (demoUser) {
            await createSession(demoUser, false);
            showNotification('Login demo realizado com sucesso!', 'success');
            redirectToApp();
        }
    } catch (error) {
        console.error('Erro no login demo:', error);
        showNotification('Erro ao fazer login demo', 'error');
    } finally {
        showLoading(false);
    }
}

// Funções de usuário
async function authenticateUser(email, password) {
    try {
        const response = await fetch('tables/usuarios');
        const data = await response.json();
        const usuarios = data.data || [];
        
        const user = usuarios.find(u => u.email === email && u.ativo);
        
        if (user && await verifyPassword(password, user.senha_hash)) {
            // Atualizar último login
            await fetch(`tables/usuarios/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ultimo_login: new Date().toISOString()
                })
            });
            
            return user;
        }
        
        return null;
    } catch (error) {
        console.error('Erro na autenticação:', error);
        throw error;
    }
}

async function findUserByEmail(email) {
    try {
        const response = await fetch('tables/usuarios');
        const data = await response.json();
        const usuarios = data.data || [];
        
        return usuarios.find(u => u.email === email);
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return null;
    }
}

async function createUser(userData) {
    try {
        const senhaHash = await hashPassword(userData.password);
        
        const newUser = {
            nome: userData.nome,
            email: userData.email,
            senha_hash: senhaHash,
            cargo: userData.cargo,
            perfil: userData.perfil,
            ativo: true,
            data_criacao: new Date().toISOString()
        };
        
        const response = await fetch('tables/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        return null;
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        throw error;
    }
}

// Funções de sessão
async function createSession(user, rememberMe) {
    const sessionData = {
        isAuthenticated: true,
        currentUser: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            cargo: user.cargo,
            perfil: user.perfil
        },
        sessionToken: generateSessionToken(),
        expiresAt: rememberMe ? 
            Date.now() + (30 * 24 * 60 * 60 * 1000) : // 30 dias
            Date.now() + (24 * 60 * 60 * 1000) // 24 horas
    };
    
    authState = sessionData;
    localStorage.setItem('stockpro_session', JSON.stringify(sessionData));
}

function isSessionValid(sessionData) {
    return sessionData && 
           sessionData.isAuthenticated && 
           sessionData.expiresAt > Date.now();
}

function generateSessionToken() {
    return btoa(Math.random().toString(36).substring(2) + Date.now().toString(36));
}

// Funções de segurança
async function hashPassword(password) {
    // Implementação simples de hash para demonstração
    // Em produção, usar bcrypt ou similar
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'stockpro_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

// Verificar primeiro acesso
async function checkFirstAccess() {
    try {
        const response = await fetch('tables/usuarios');
        const data = await response.json();
        const usuarios = data.data || [];
        
        if (usuarios.length === 0) {
            // Criar usuário administrador inicial
            await createUser({
                nome: 'Administrador',
                email: 'admin@stockpro.com',
                cargo: 'Administrador do Sistema',
                perfil: 'admin',
                password: 'admin123'
            });
            
            showNotification('Usuário administrador criado! Email: admin@stockpro.com, Senha: admin123', 'info');
        }
    } catch (error) {
        console.error('Erro ao verificar primeiro acesso:', error);
    }
}

// Funções de UI
function showLoginLoading(show) {
    const btn = document.getElementById('login-btn');
    const text = btn.querySelector('.login-btn-text');
    const spinner = document.getElementById('login-spinner');
    
    if (show) {
        btn.disabled = true;
        text.textContent = 'Entrando...';
        spinner.classList.remove('hidden');
    } else {
        btn.disabled = false;
        text.textContent = 'Entrar';
        spinner.classList.add('hidden');
    }
}

// Função de loading do registro removida junto com o formulário

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification-enter fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
        type === 'error' ? 'bg-red-500 text-white' : 
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'info' ? 'bg-blue-500 text-white' :
        'bg-gray-500 text-white'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'} mr-3"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function redirectToApp() {
    window.location.href = 'index.html';
}

// Funções para exportar para uso global
window.auth = {
    getCurrentUser: () => authState.currentUser,
    isAuthenticated: () => authState.isAuthenticated,
    logout: () => {
        authState = { isAuthenticated: false, currentUser: null, sessionToken: null };
        localStorage.removeItem('stockpro_session');
        window.location.href = 'login.html';
    }
};