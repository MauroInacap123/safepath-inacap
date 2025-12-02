// ===== CONFIGURACIÓN FIREBASE =====
// Se inicializa desde config.js

// ===== VARIABLES GLOBALES =====
let currentUser = null;
let currentLocation = { lat: -33.5038, lng: -70.7590, address: 'Detectando...' };
let selectedIncidentType = null;
let selectedRiskLevel = null;
let mapInstance = null;
let userMarker = null;
let reportMarkers = [];
let allReports = [];
let selectedMedia = null;
let locationWatchId = null;

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    updateTime();
    setInterval(updateTime, 60000); // Actualizar cada minuto
});

function initializeApp() {
    // Verificar si hay usuario logueado
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            loadUserProfile(user.uid);
            navigateTo('home');
            startLocationTracking();
            loadAllReports();
        } else {
            navigateTo('login');
        }
    });
}

// ===== MANEJO DE TIEMPO Y ESTADO =====
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const timeElements = document.querySelectorAll('#current-time, #home-time');
    timeElements.forEach(el => {
        if (el) el.textContent = timeString;
    });
    
    // Actualizar batería (simulado)
    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            const batteryElements = document.querySelectorAll('#battery');
            batteryElements.forEach(el => {
                if (el) el.textContent = Math.round(battery.level * 100);
            });
        });
    }
}

// ===== VALIDACIÓN DE RUT =====
function formatRut(rut) {
    // Eliminar puntos y guión
    rut = rut.replace(/\./g, '').replace(/-/g, '');
    
    // Separar número y dígito verificador
    const rutNumber = rut.slice(0, -1);
    const dv = rut.slice(-1);
    
    // Formatear con puntos
    const formattedNumber = rutNumber.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    return `${formattedNumber}-${dv}`;
}

function validateRut(rut) {
    // Limpiar el RUT
    rut = rut.replace(/\./g, '').replace(/-/g, '');
    
    if (rut.length < 2) return false;
    
    const rutNumber = rut.slice(0, -1);
    const dv = rut.slice(-1).toUpperCase();
    
    // Calcular dígito verificador
    let suma = 0;
    let multiplo = 2;
    
    for (let i = rutNumber.length - 1; i >= 0; i--) {
        suma += parseInt(rutNumber.charAt(i)) * multiplo;
        multiplo = multiplo < 7 ? multiplo + 1 : 2;
    }
    
    const dvEsperado = 11 - (suma % 11);
    const dvCalculado = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'K' : dvEsperado.toString();
    
    return dv === dvCalculado;
}

function validateInacapEmail(email) {
    return email.toLowerCase().endsWith('@inacapmail.cl');
}

// ===== AUTENTICACIÓN =====
function setupEventListeners() {
    // Tabs de login/registro
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (tabLogin) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        });
    }
    
    if (tabRegister) {
        tabRegister.addEventListener('click', () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
        });
    }
    
    // Formulario de Login
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Formulario de Registro
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Formateo automático de RUT
    const registerRutInput = document.getElementById('register-rut');
    if (registerRutInput) {
        registerRutInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/\./g, '').replace(/-/g, '');
            if (value.length > 1) {
                e.target.value = formatRut(value);
            }
        });
    }
    
    // Botón SOS - MEJORADO
    const panicButton = document.getElementById('panic-button');
    if (panicButton) {
        let pressTimer;
        let isPressed = false;
        
        // Para mouse
        panicButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isPressed = true;
            panicButton.style.transform = 'scale(0.95)';
            showNotification('Mantén presionado...', 'info');
            pressTimer = setTimeout(() => {
                if (isPressed) {
                    activateSOS();
                }
            }, 2000);
        });
        
        panicButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            isPressed = false;
            panicButton.style.transform = 'scale(1)';
            clearTimeout(pressTimer);
        });
        
        panicButton.addEventListener('mouseleave', () => {
            isPressed = false;
            panicButton.style.transform = 'scale(1)';
            clearTimeout(pressTimer);
        });
        
        // Para táctil (móvil)
        panicButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isPressed = true;
            panicButton.style.transform = 'scale(0.95)';
            showNotification('Mantén presionado...', 'info');
            pressTimer = setTimeout(() => {
                if (isPressed) {
                    activateSOS();
                }
            }, 2000);
        });
        
        panicButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            isPressed = false;
            panicButton.style.transform = 'scale(1)';
            clearTimeout(pressTimer);
        });
        
        panicButton.addEventListener('touchcancel', () => {
            isPressed = false;
            panicButton.style.transform = 'scale(1)';
            clearTimeout(pressTimer);
        });
    }
    
    // Botón reportar
    const reportButton = document.getElementById('report-button');
    if (reportButton) {
        reportButton.addEventListener('click', () => navigateTo('report'));
    }
    
    // Botón ver reportes cercanos - AGREGADO
    const viewNearbyButton = document.getElementById('view-nearby-button');
    if (viewNearbyButton) {
        viewNearbyButton.addEventListener('click', () => navigateTo('map'));
    }
    
    // Formulario de reporte
    const reportForm = document.getElementById('report-form');
    if (reportForm) {
        reportForm.addEventListener('submit', handleReportSubmit);
    }
    
    // Selección de tipo de incidente
    const incidentCards = document.querySelectorAll('.incident-card');
    incidentCards.forEach(card => {
        card.addEventListener('click', () => {
            incidentCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedIncidentType = card.dataset.type;
            selectedRiskLevel = card.dataset.risk;
        });
    });
    
    // Manejo de archivos multimedia
    const reportMedia = document.getElementById('report-media');
    if (reportMedia) {
        reportMedia.addEventListener('change', handleMediaUpload);
    }
    
    const removeMedia = document.getElementById('remove-media');
    if (removeMedia) {
        removeMedia.addEventListener('click', clearMediaSelection);
    }
    
    // Actualizar ubicación
    const updateLocationBtn = document.getElementById('update-location-btn');
    if (updateLocationBtn) {
        updateLocationBtn.addEventListener('click', () => {
            getUserLocation(true);
        });
    }
    
    // Navegación inferior
    setupNavigation();
    
    // Chatbot
    const openChatbot = document.getElementById('open-chatbot');
    if (openChatbot) {
        openChatbot.addEventListener('click', () => {
            document.getElementById('chatbot-modal').classList.add('active');
        });
    }
    
    const closeChatbot = document.getElementById('close-chatbot');
    if (closeChatbot) {
        closeChatbot.addEventListener('click', () => {
            document.getElementById('chatbot-modal').classList.remove('active');
        });
    }
    
    const chatbotSend = document.getElementById('chatbot-send');
    if (chatbotSend) {
        chatbotSend.addEventListener('click', sendChatbotMessage);
    }
    
    const chatbotInput = document.getElementById('chatbot-input-field');
    if (chatbotInput) {
        chatbotInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatbotMessage();
        });
    }
    
    // Respuestas rápidas del chatbot
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('quick-reply')) {
            handleQuickReply(e.target.dataset.action);
        }
    });
    
    // Cerrar SOS
    const closeSos = document.getElementById('close-sos');
    if (closeSos) {
        closeSos.addEventListener('click', () => {
            document.getElementById('sos-modal').classList.remove('active');
        });
    }
    
    const sosChatbot = document.getElementById('sos-chatbot');
    if (sosChatbot) {
        sosChatbot.addEventListener('click', () => {
            document.getElementById('sos-modal').classList.remove('active');
            document.getElementById('chatbot-modal').classList.add('active');
        });
    }
    
    // Logout
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // Olvidaste tu contraseña
    const forgotPasswordLink = document.getElementById('forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('forgot-password-modal').classList.add('active');
        });
    }

    const closeForgotPassword = document.getElementById('close-forgot-password');
    if (closeForgotPassword) {
        closeForgotPassword.addEventListener('click', () => {
            document.getElementById('forgot-password-modal').classList.remove('active');
            document.getElementById('forgot-password-form').reset();
            document.getElementById('reset-success').style.display = 'none';
        });
    }

    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }
    
    // Editar perfil
    const editProfileForm = document.getElementById('edit-profile-form');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', handleEditProfile);
    }
    
    // Agregar contacto
    const addContactForm = document.getElementById('add-contact-form');
    if (addContactForm) {
        addContactForm.addEventListener('submit', handleAddContact);
    }
    
    // Refrescar mapa
    const refreshMap = document.getElementById('refresh-map');
    if (refreshMap) {
        refreshMap.addEventListener('click', () => {
            loadAllReports();
            if (mapInstance) {
                updateMapMarkers();
            }
        });
    }
    
    // Filtros de mapa
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMapMarkers(btn.dataset.filter);
        });
    });
}

async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    
    showLoader();
    
    try {
        let email = identifier;
        
        // Si es un RUT, buscar el email asociado
        if (identifier.includes('-')) {
            const usersRef = firebase.firestore().collection('users');
            const snapshot = await usersRef.where('rut', '==', identifier).get();
            
            if (snapshot.empty) {
                throw new Error('RUT no encontrado');
            }
            
            email = snapshot.docs[0].data().email;
        }
        
        // Iniciar sesión
        await firebase.auth().signInWithEmailAndPassword(email, password);
        
        showNotification('¡Bienvenido de vuelta!', 'success');
        
    } catch (error) {
        console.error('Error login:', error);
        let message = 'Error al iniciar sesión';
        
        if (error.code === 'auth/user-not-found' || error.message === 'RUT no encontrado') {
            message = 'Usuario no encontrado';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Contraseña incorrecta';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Correo inválido';
        }
        
        showNotification(message, 'error');
    } finally {
        hideLoader();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const rut = document.getElementById('register-rut').value.trim();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm').value;
    
    // Validaciones
    if (!validateInacapEmail(email)) {
        showNotification('Debe usar un correo @inacapmail.cl', 'error');
        return;
    }
    
    if (!validateRut(rut)) {
        showNotification('RUT inválido', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showNotification('Las contraseñas no coinciden', 'error');
        return;
    }
    
    showLoader();
    
    try {
        // Crear usuario en Firebase Auth
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Guardar información adicional en Firestore
        await firebase.firestore().collection('users').doc(user.uid).set({
            name: name,
            rut: rut,
            email: email,
            phone: phone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            contacts: []
        });
        
        showNotification('¡Cuenta creada exitosamente!', 'success');
        
    } catch (error) {
        console.error('Error registro:', error);
        let message = 'Error al crear cuenta';
        
        if (error.code === 'auth/email-already-in-use') {
            message = 'El correo ya está registrado';
        } else if (error.code === 'auth/weak-password') {
            message = 'Contraseña muy débil';
        }
        
        showNotification(message, 'error');
    } finally {
        hideLoader();
    }
}

async function loadUserProfile(uid) {
    try {
        const doc = await firebase.firestore().collection('users').doc(uid).get();
        
        if (doc.exists) {
            currentUser = {
                uid: uid,
                ...doc.data()
            };
            
            updateUIWithUserData();
        }
    } catch (error) {
        console.error('Error cargando perfil:', error);
    }
}

function updateUIWithUserData() {
    if (!currentUser) return;
    
    // Actualizar nombre en header
    const userNameDisplay = document.getElementById('user-name-display');
    if (userNameDisplay) {
        userNameDisplay.textContent = currentUser.name.split(' ')[0];
    }
    
    // Actualizar perfil
    const profileName = document.getElementById('profile-name');
    if (profileName) profileName.textContent = currentUser.name;
    
    const profileEmail = document.getElementById('profile-email');
    if (profileEmail) profileEmail.textContent = currentUser.email;
    
    const profileEmailDetail = document.getElementById('profile-email-detail');
    if (profileEmailDetail) profileEmailDetail.textContent = currentUser.email;
    
    const profileRut = document.getElementById('profile-rut');
    if (profileRut) profileRut.textContent = currentUser.rut;
    
    const profileRutDetail = document.getElementById('profile-rut-detail');
    if (profileRutDetail) profileRutDetail.textContent = currentUser.rut;
    
    const profilePhoneDetail = document.getElementById('profile-phone-detail');
    if (profilePhoneDetail) profilePhoneDetail.textContent = currentUser.phone || 'No registrado';
    
    // Actualizar inicial del avatar
    const avatarInitial = document.getElementById('avatar-initial');
    if (avatarInitial && currentUser.name) {
        avatarInitial.textContent = currentUser.name.charAt(0).toUpperCase();
    }
    
    // Cargar contactos
    loadContacts();
}

function handleLogout() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
        firebase.auth().signOut().then(() => {
            currentUser = null;
            if (locationWatchId) {
                navigator.geolocation.clearWatch(locationWatchId);
                locationWatchId = null;
            }
            showNotification('Sesión cerrada', 'info');
            navigateTo('login');
        });
    }
}



// ===== UBICACIÓN GPS - MEJORADO =====
function startLocationTracking() {
    if (navigator.geolocation) {
        // Obtener ubicación inicial con alta precisión
        getUserLocation(true);
        
        // Rastreo continuo con configuración mejorada
        locationWatchId = navigator.geolocation.watchPosition(
            (position) => {
                updateCurrentLocation(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.error('Error geolocalización:', error);
                showNotification('No se pudo obtener ubicación precisa', 'warning');
            },
            {
                enableHighAccuracy: true,  // Alta precisión
                timeout: 15000,            // 15 segundos de timeout
                maximumAge: 0              // No usar cache
            }
        );
    } else {
        showNotification('Tu dispositivo no soporta geolocalización', 'error');
    }
}

function getUserLocation(showNotif = false) {
    if (navigator.geolocation) {
        if (showNotif) showNotification('Obteniendo ubicación precisa...', 'info');
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                await updateCurrentLocation(position.coords.latitude, position.coords.longitude);
                if (showNotif) showNotification('Ubicación actualizada', 'success');
            },
            (error) => {
                console.error('Error GPS:', error);
                showNotification('No se pudo obtener la ubicación', 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }
}

async function updateCurrentLocation(lat, lng) {
    currentLocation = {
        lat: lat,
        lng: lng,
        address: 'Cargando dirección...'
    };
    
    // Obtener dirección usando Google Maps Geocoding
    try {
        if (typeof google !== 'undefined' && google.maps) {
            const geocoder = new google.maps.Geocoder();
            const latlng = { lat: lat, lng: lng };
            
            geocoder.geocode({ location: latlng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    currentLocation.address = results[0].formatted_address;
                    updateLocationDisplay();
                }
            });
        }
    } catch (error) {
        console.error('Error geocoding:', error);
    }
    
    updateLocationDisplay();
    
    // Actualizar marcador en el mapa si está abierto
    if (mapInstance && userMarker) {
        userMarker.setPosition({ lat, lng });
        mapInstance.panTo({ lat, lng });
    }
}

function updateLocationDisplay() {
    const locationText = document.getElementById('current-location');
    if (locationText) {
        locationText.textContent = currentLocation.address;
    }
    
    const coordsText = document.getElementById('current-coords');
    if (coordsText) {
        coordsText.textContent = `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}`;
    }
    
    const reportLocation = document.getElementById('report-location');
    if (reportLocation) {
        reportLocation.value = currentLocation.address;
    }
}

// ===== BOTÓN SOS =====
async function activateSOS() {
    showLoader();
    
    try {
        // Crear alerta SOS en Firebase
        const sosData = {
            userId: currentUser.uid,
            userName: currentUser.name,
            userEmail: currentUser.email,
            userPhone: currentUser.phone,
            location: {
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                address: currentLocation.address
            },
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await firebase.firestore().collection('sos_alerts').add(sosData);
        
        // Mostrar modal SOS
        const sosLocationDisplay = document.getElementById('sos-location-display');
        if (sosLocationDisplay) {
            sosLocationDisplay.textContent = currentLocation.address;
        }
        
        document.getElementById('sos-modal').classList.add('active');
        
        // Vibrar si está disponible
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
        
        showNotification('¡Alerta SOS enviada!', 'success');
        
    } catch (error) {
        console.error('Error SOS:', error);
        showNotification('Error al enviar alerta SOS', 'error');
    } finally {
        hideLoader();
    }
}

// ===== REPORTES =====
function handleMediaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
        selectedMedia = {
            file: file,
            dataUrl: event.target.result,
            type: file.type.startsWith('image/') ? 'image' : 'video'
        };
        
        showMediaPreview();
    };
    
    reader.readAsDataURL(file);
}

function showMediaPreview() {
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const mediaPreview = document.getElementById('media-preview');
    const previewImage = document.getElementById('preview-image');
    const previewVideo = document.getElementById('preview-video');
    
    uploadPlaceholder.style.display = 'none';
    mediaPreview.style.display = 'block';
    
    if (selectedMedia.type === 'image') {
        previewImage.src = selectedMedia.dataUrl;
        previewImage.style.display = 'block';
        previewVideo.style.display = 'none';
    } else {
        previewVideo.src = selectedMedia.dataUrl;
        previewVideo.style.display = 'block';
        previewImage.style.display = 'none';
    }
}

function clearMediaSelection() {
    selectedMedia = null;
    document.getElementById('upload-placeholder').style.display = 'flex';
    document.getElementById('media-preview').style.display = 'none';
    document.getElementById('report-media').value = '';
}

async function handleReportSubmit(e) {
    e.preventDefault();
    
    if (!selectedIncidentType) {
        showNotification('Selecciona un tipo de incidente', 'warning');
        return;
    }
    
    const description = document.getElementById('report-description').value.trim();
    
    if (!description) {
        showNotification('Agrega una descripción', 'warning');
        return;
    }
    
    showLoader();
    
    try {
        let mediaUrl = null;
        
        // Subir archivo multimedia si existe (comentado porque Storage no está habilitado)
        /*
        if (selectedMedia) {
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`reports/${Date.now()}_${selectedMedia.file.name}`);
            await fileRef.put(selectedMedia.file);
            mediaUrl = await fileRef.getDownloadURL();
        }
        */
        
        // Crear reporte
        const reportData = {
            userId: currentUser.uid,
            userName: currentUser.name,
            type: selectedIncidentType,
            riskLevel: selectedRiskLevel,
            description: description,
            location: {
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                address: currentLocation.address
            },
            mediaUrl: mediaUrl,
            mediaType: selectedMedia ? selectedMedia.type : null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await firebase.firestore().collection('reports').add(reportData);
        
        showNotification('¡Reporte enviado exitosamente!', 'success');
        
        // Limpiar formulario
        document.getElementById('report-form').reset();
        document.querySelectorAll('.incident-card').forEach(c => c.classList.remove('selected'));
        clearMediaSelection();
        selectedIncidentType = null;
        selectedRiskLevel = null;
        
        // Recargar reportes
        loadAllReports();
        
        // Volver al home
        setTimeout(() => {
            navigateTo('home');
        }, 1500);
        
    } catch (error) {
        console.error('Error enviando reporte:', error);
        showNotification('Error al enviar reporte', 'error');
    } finally {
        hideLoader();
    }
}

async function loadAllReports() {
    try {
        const snapshot = await firebase.firestore()
            .collection('reports')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        
        allReports = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            allReports.push({
                id: doc.id,
                ...data,
                timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
            });
        });
        
        updateStats();
        updateHistoryList();
        if (mapInstance) {
            updateMapMarkers();
        }
        
    } catch (error) {
        console.error('Error cargando reportes:', error);
    }
}

function updateStats() {
    const totalReports = document.getElementById('total-reports');
    if (totalReports) {
        totalReports.textContent = allReports.length;
    }
    
    // Calcular reportes cercanos (1km)
    const nearbyReports = allReports.filter(report => {
        const distance = calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            report.location.lat,
            report.location.lng
        );
        return distance <= 1; // 1 km
    });
    
    const nearbyElement = document.getElementById('nearby-reports');
    if (nearbyElement) {
        nearbyElement.textContent = nearbyReports.length;
    }
    
    // Calcular alto riesgo
    const highRisk = allReports.filter(r => r.riskLevel === 'high');
    const highRiskElement = document.getElementById('high-risk-reports');
    if (highRiskElement) {
        highRiskElement.textContent = highRisk.length;
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateHistoryList() {
    const historyList = document.getElementById('history-list');
    const emptyHistory = document.getElementById('empty-history');
    
    if (!historyList) return;
    
    // Filtrar solo reportes del usuario actual
    const userReports = allReports.filter(r => r.userId === currentUser.uid);
    
    if (userReports.length === 0) {
        historyList.innerHTML = '';
        if (emptyHistory) emptyHistory.style.display = 'block';
        return;
    }
    
    if (emptyHistory) emptyHistory.style.display = 'none';
    
    historyList.innerHTML = userReports.map(report => {
        const riskClass = report.riskLevel;
        const riskText = riskClass === 'high' ? 'Alto Riesgo' : 
                        riskClass === 'medium' ? 'Medio Riesgo' : 'Bajo Riesgo';
        
        return `
            <div class="history-item" onclick="showReportDetail('${report.id}')">
                <div class="history-header">
                    <span class="history-type">${getIncidentIcon(report.type)} ${getIncidentName(report.type)}</span>
                    <span class="risk-badge ${riskClass}">${riskText}</span>
                </div>
                <div class="history-location">📍 ${report.location.address}</div>
                <div class="history-time">🕐 ${formatDateTime(report.timestamp)}</div>
                ${report.mediaUrl ? '<div class="history-media">📷 Con multimedia</div>' : ''}
            </div>
        `;
    }).join('');
}

function getIncidentIcon(type) {
    const icons = {
        robo: '🚨',
        asalto: '⚠️',
        acoso: '👥',
        sospechoso: '👤',
        incendio: '🔥',
        salud: '🏥',
        accidente: '🚗',
        otro: '📋'
    };
    return icons[type] || '📋';
}

function getIncidentName(type) {
    const names = {
        robo: 'Robo',
        asalto: 'Asalto',
        acoso: 'Acoso',
        sospechoso: 'Persona Sospechosa',
        incendio: 'Incendio',
        salud: 'Emergencia de Salud',
        accidente: 'Accidente',
        otro: 'Otro'
    };
    return names[type] || 'Incidente';
}

function formatDateTime(date) {
    return date.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showReportDetail(reportId) {
    const report = allReports.find(r => r.id === reportId);
    if (!report) return;
    
    const riskClass = report.riskLevel;
    const riskText = riskClass === 'high' ? 'Alto Riesgo' : 
                    riskClass === 'medium' ? 'Medio Riesgo' : 'Bajo Riesgo';
    
    const content = `
        <div class="report-detail">
            <div class="report-detail-header">
                <h3>${getIncidentIcon(report.type)} ${getIncidentName(report.type)}</h3>
                <span class="risk-badge ${riskClass}">${riskText}</span>
            </div>
            
            <div class="report-detail-section">
                <strong>Descripción:</strong>
                <p>${report.description}</p>
            </div>
            
            <div class="report-detail-section">
                <strong>📍 Ubicación:</strong>
                <p>${report.location.address}</p>
                <p class="coords">${report.location.lat.toFixed(6)}, ${report.location.lng.toFixed(6)}</p>
            </div>
            
            <div class="report-detail-section">
                <strong>🕐 Fecha y Hora:</strong>
                <p>${formatDateTime(report.timestamp)}</p>
            </div>
            
            <div class="report-detail-section">
                <strong>👤 Reportado por:</strong>
                <p>${report.userName}</p>
            </div>
            
            ${report.mediaUrl ? `
                <div class="report-detail-section">
                    <strong>📷 Multimedia:</strong>
                    ${report.mediaType === 'image' ? 
                        `<img src="${report.mediaUrl}" class="report-media-full">` :
                        `<video src="${report.mediaUrl}" controls class="report-media-full"></video>`
                    }
                </div>
            ` : ''}
            
            <button class="btn btn-primary" onclick="openInMaps(${report.location.lat}, ${report.location.lng})">
                🗺️ Ver en Google Maps
            </button>
        </div>
    `;
    
    document.getElementById('report-detail-content').innerHTML = content;
    document.getElementById('report-detail-modal').classList.add('active');
    
    const closeBtn = document.getElementById('close-report-detail');
    closeBtn.onclick = () => {
        document.getElementById('report-detail-modal').classList.remove('active');
    };
}

function openInMaps(lat, lng) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
}

// ===== MAPA - MEJORADO V2 =====
function initializeMap() {
    const mapContainer = document.getElementById('map-container');
    
    console.log('🗺️ Inicializando mapa...');
    console.log('Container encontrado:', mapContainer);
    console.log('Google Maps disponible:', typeof google !== 'undefined');
    
    if (!mapContainer) {
        console.error('❌ No se encontró map-container');
        return;
    }
    
    // Si el mapa ya existe, solo actualizar centro
    if (mapInstance) {
        console.log('✅ Mapa ya existe, actualizando centro');
        mapInstance.setCenter({ lat: currentLocation.lat, lng: currentLocation.lng });
        if (userMarker) {
            userMarker.setPosition({ lat: currentLocation.lat, lng: currentLocation.lng });
        }
        return;
    }
    
    // Verificar que Google Maps esté cargado
    if (typeof google === 'undefined' || !google.maps) {
        console.error('⏳ Google Maps no está cargado aún');
        showNotification('Esperando Google Maps...', 'info');
        
        // Reintentar después de 2 segundos
        setTimeout(() => {
            console.log('🔄 Reintentando inicializar mapa...');
            initializeMap();
        }, 2000);
        return;
    }
    
    try {
        console.log('📍 Creando instancia de mapa...');
        console.log('Ubicación actual:', currentLocation);
        
        // Asegurarse de que el contenedor tenga dimensiones
        mapContainer.style.width = '100%';
        mapContainer.style.height = '100%';
        mapContainer.style.minHeight = '400px';
        
        mapInstance = new google.maps.Map(mapContainer, {
            center: { lat: currentLocation.lat, lng: currentLocation.lng },
            zoom: 15,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true
        });
        
        console.log('✅ Mapa creado:', mapInstance);
        
        // Crear marcador del usuario
        userMarker = new google.maps.Marker({
            position: { lat: currentLocation.lat, lng: currentLocation.lng },
            map: mapInstance,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
                scale: 10
            },
            title: 'Tu ubicación'
        });
        
        console.log('✅ Marcador de usuario creado');
        
        // Esperar antes de cargar reportes
        setTimeout(() => {
            console.log('📍 Cargando marcadores de reportes...');
            updateMapMarkers();
        }, 1000);
        
        console.log('✅ Mapa inicializado correctamente');
        showNotification('Mapa cargado', 'success');
        
    } catch (error) {
        console.error('❌ Error al inicializar el mapa:', error);
        showNotification('Error al cargar el mapa: ' + error.message, 'error');
    }
}

function updateMapMarkers() {
    if (!mapInstance) {
        console.log('⚠️ No hay instancia de mapa para actualizar marcadores');
        return;
    }
    
    console.log('🔄 Actualizando marcadores del mapa...');
    console.log('Total reportes:', allReports.length);
    
    // Limpiar marcadores existentes
    reportMarkers.forEach(marker => marker.setMap(null));
    reportMarkers = [];
    
    // Agregar marcador para cada reporte
    allReports.forEach(report => {
        const marker = new google.maps.Marker({
            position: { lat: report.location.lat, lng: report.location.lng },
            map: mapInstance,
            icon: {
                url: getMarkerIcon(report.riskLevel),
                scaledSize: new google.maps.Size(32, 32)
            },
            title: getIncidentName(report.type),
            riskLevel: report.riskLevel
        });
        
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div class="map-info-window">
                    <h4>${getIncidentIcon(report.type)} ${getIncidentName(report.type)}</h4>
                    <p><strong>Descripción:</strong> ${report.description.substring(0, 100)}...</p>
                    <p><strong>Ubicación:</strong> ${report.location.address}</p>
                    <p><strong>Fecha:</strong> ${formatDateTime(report.timestamp)}</p>
                    <button onclick="showReportDetail('${report.id}')" class="btn btn-small">Ver detalles</button>
                </div>
            `
        });
        
        marker.addListener('click', () => {
            infoWindow.open(mapInstance, marker);
        });
        
        reportMarkers.push(marker);
    });
    
    console.log('✅ Marcadores actualizados:', reportMarkers.length);
}

function getMarkerIcon(riskLevel) {
    // URLs de marcadores por color
    const colors = {
        high: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        medium: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
        low: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
    };
    return colors[riskLevel] || colors.low;
}

function filterMapMarkers(filter) {
    reportMarkers.forEach(marker => {
        if (filter === 'all') {
            marker.setVisible(true);
        } else {
            marker.setVisible(marker.riskLevel === filter);
        }
    });
}

// ===== CHATBOT =====
function sendChatbotMessage() {
    const input = document.getElementById('chatbot-input-field');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Agregar mensaje del usuario
    addChatMessage(message, 'user');
    
    input.value = '';
    
    // Responder según el mensaje
    setTimeout(() => {
        const response = getChatbotResponse(message);
        addChatMessage(response.text, 'bot', response.quickReplies);
    }, 500);
}

function addChatMessage(text, sender, quickReplies = null) {
    const messagesContainer = document.getElementById('chatbot-messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'user' ? 'user-message' : 'bot-message';
    
    let html = '';
    
    if (sender === 'bot') {
        html += '<div class="message-avatar">🤖</div>';
    }
    
    html += `<div class="message-bubble"><p>${text}</p>`;
    
    if (quickReplies) {
        html += '<div class="quick-replies">';
        quickReplies.forEach(reply => {
            html += `<button class="quick-reply" data-action="${reply.action}">${reply.label}</button>`;
        });
        html += '</div>';
    }
    
    html += '</div>';
    
    messageDiv.innerHTML = html;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getChatbotResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('hola') || lowerMessage.includes('ayuda')) {
        return {
            text: '¡Hola! Estoy aquí para ayudarte en caso de emergencia. ¿Qué necesitas?',
            quickReplies: [
                { label: '🚔 Carabineros', action: 'police' },
                { label: '🚑 Ambulancia', action: 'ambulance' },
                { label: '🚒 Bomberos', action: 'fire' }
            ]
        };
    }
    
    if (lowerMessage.includes('robo') || lowerMessage.includes('asalto')) {
        return {
            text: 'Entiendo que has sido víctima de un robo o asalto. Te recomiendo:\n\n1. Mantén la calma\n2. Llama inmediatamente a Carabineros al 133\n3. No persigas a los delincuentes\n4. Reporta el incidente en SafePath',
            quickReplies: [
                { label: '📞 Llamar Carabineros', action: 'police' },
                { label: '📝 Hacer reporte', action: 'report' }
            ]
        };
    }
    
    if (lowerMessage.includes('accidente') || lowerMessage.includes('herido')) {
        return {
            text: 'Si hay heridos:\n\n1. Llama al SAMU (131) inmediatamente\n2. No muevas a personas heridas\n3. Mantén la zona segura\n4. Espera a los paramédicos',
            quickReplies: [
                { label: '📞 Llamar SAMU', action: 'ambulance' }
            ]
        };
    }
    
    if (lowerMessage.includes('incendio') || lowerMessage.includes('fuego')) {
        return {
            text: 'En caso de incendio:\n\n1. Evacúa el lugar inmediatamente\n2. Llama a Bomberos (132)\n3. No uses agua en incendios eléctricos\n4. Mantente alejado del humo',
            quickReplies: [
                { label: '📞 Llamar Bomberos', action: 'fire' }
            ]
        };
    }
    
    return {
        text: 'Para ayudarte mejor, dime qué tipo de emergencia tienes.',
        quickReplies: [
            { label: '🚔 Carabineros', action: 'police' },
            { label: '🚑 Ambulancia', action: 'ambulance' },
            { label: '🚒 Bomberos', action: 'fire' },
            { label: '📝 Reportar', action: 'report' }
        ]
    };
}

function handleQuickReply(action) {
    switch (action) {
        case 'police':
            addChatMessage('Carabineros de Chile', 'user');
            addChatMessage('Te voy a conectar con Carabineros. El número es 133. ¿Deseas llamar ahora?', 'bot', [
                { label: '📞 Llamar 133', action: 'call-133' }
            ]);
            break;
        case 'ambulance':
            addChatMessage('Ambulancia', 'user');
            addChatMessage('Te voy a conectar con SAMU (Servicio de Atención Médica de Urgencia). El número es 131. ¿Deseas llamar ahora?', 'bot', [
                { label: '📞 Llamar 131', action: 'call-131' }
            ]);
            break;
        case 'fire':
            addChatMessage('Bomberos', 'user');
            addChatMessage('Te voy a conectar con Bomberos de Chile. El número es 132. ¿Deseas llamar ahora?', 'bot', [
                { label: '📞 Llamar 132', action: 'call-132' }
            ]);
            break;
        case 'call-133':
            window.location.href = 'tel:133';
            addChatMessage('Conectando con Carabineros...', 'bot');
            break;
        case 'call-131':
            window.location.href = 'tel:131';
            addChatMessage('Conectando con SAMU...', 'bot');
            break;
        case 'call-132':
            window.location.href = 'tel:132';
            addChatMessage('Conectando con Bomberos...', 'bot');
            break;
        case 'report':
            addChatMessage('Quiero hacer un reporte', 'user');
            addChatMessage('Te llevaré a la sección de reportes para que puedas documentar el incidente.', 'bot');
            setTimeout(() => {
                document.getElementById('chatbot-modal').classList.remove('active');
                navigateTo('report');
            }, 1000);
            break;
        case 'info':
            addChatMessage('Información', 'user');
            addChatMessage('SafePath es tu sistema de seguridad en el campus INACAP. Puedes:\n\n• Reportar incidentes\n• Activar alerta SOS\n• Ver reportes cercanos en el mapa\n• Acceder a números de emergencia\n\n¿Qué necesitas hacer?', 'bot', [
                { label: '📝 Reportar', action: 'report' },
                { label: '🚨 Ver emergencias', action: 'emergencies' }
            ]);
            break;
        case 'emergencies':
            document.getElementById('chatbot-modal').classList.remove('active');
            navigateTo('emergency');
            break;
    }
}

// ===== PERFIL Y CONTACTOS =====
function loadContacts() {
    const contactsList = document.getElementById('contacts-list');
    if (!contactsList || !currentUser) return;
    
    const contacts = currentUser.contacts || [];
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<p class="empty-contacts">No tienes contactos de emergencia aún</p>';
        return;
    }
    
    contactsList.innerHTML = contacts.map((contact, index) => `
        <div class="contact-item">
            <div class="contact-info">
                <div class="contact-name">${contact.name}</div>
                <div class="contact-relation">${contact.relation}</div>
                <div class="contact-phone">${contact.phone}</div>
            </div>
            <div class="contact-actions">
                <a href="tel:${contact.phone}" class="btn btn-small">📞 Llamar</a>
                <button class="btn btn-small btn-danger" onclick="deleteContact(${index})">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function handleAddContact(e) {
    e.preventDefault();
    
    const name = document.getElementById('contact-name').value.trim();
    const relation = document.getElementById('contact-relation').value;
    const phone = document.getElementById('contact-phone').value.trim();
    
    if (!name || !relation || !phone) {
        showNotification('Completa todos los campos', 'warning');
        return;
    }
    
    showLoader();
    
    try {
        const contacts = currentUser.contacts || [];
        contacts.push({ name, relation, phone });
        
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            contacts: contacts
        });
        
        currentUser.contacts = contacts;
        
        showNotification('Contacto agregado', 'success');
        loadContacts();
        navigateTo('profile');
        
        // Limpiar formulario
        document.getElementById('add-contact-form').reset();
        
    } catch (error) {
        console.error('Error agregando contacto:', error);
        showNotification('Error al agregar contacto', 'error');
    } finally {
        hideLoader();
    }
}

async function deleteContact(index) {
    if (!confirm('¿Eliminar este contacto?')) return;
    
    showLoader();
    
    try {
        const contacts = currentUser.contacts || [];
        contacts.splice(index, 1);
        
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            contacts: contacts
        });
        
        currentUser.contacts = contacts;
        
        showNotification('Contacto eliminado', 'success');
        loadContacts();
        
    } catch (error) {
        console.error('Error eliminando contacto:', error);
        showNotification('Error al eliminar contacto', 'error');
    } finally {
        hideLoader();
    }
}

async function handleEditProfile(e) {
    e.preventDefault();
    
    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    
    if (!name) {
        showNotification('El nombre es obligatorio', 'warning');
        return;
    }
    
    showLoader();
    
    try {
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            name: name,
            phone: phone
        });
        
        currentUser.name = name;
        currentUser.phone = phone;
        
        showNotification('Perfil actualizado', 'success');
        updateUIWithUserData();
        navigateTo('profile');
        
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        showNotification('Error al actualizar perfil', 'error');
    } finally {
        hideLoader();
    }
}

// ===== NAVEGACIÓN =====
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const screen = item.dataset.screen;
            if (screen) {
                navigateTo(screen);
            }
        });
    });
}

function navigateTo(screenName) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(`screen-${screenName}`);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Actualizar navegación activa
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.screen === screenName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Cargar datos específicos de la pantalla
    if (screenName === 'map') {
        setTimeout(() => initializeMap(), 100);
    } else if (screenName === 'history') {
        loadAllReports();
    } else if (screenName === 'profile') {
        loadContacts();
    } else if (screenName === 'edit-profile') {
        // Prellenar formulario
        document.getElementById('edit-name').value = currentUser.name || '';
        document.getElementById('edit-email').value = currentUser.email || '';
        document.getElementById('edit-rut').value = currentUser.rut || '';
        document.getElementById('edit-phone').value = currentUser.phone || '';
    }
}

// ===== UTILIDADES =====
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    
    notificationText.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function showLoader() {
    document.getElementById('loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registrado'))
        .catch(err => console.log('Error SW:', err));
}