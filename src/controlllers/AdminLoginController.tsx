import React, { useState, useRef, useEffect } from 'react';
import { Animated, View, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdminLoginView } from '../views/AdminLoginView';
import { ForgotPasswordView } from '../views/ForgotPasswordView';
import { HomeView } from '../views/HomeView';
import { CategoryView } from '../views/CategoryView';
import { ProductView } from '../views/ProductView';
import { OrderView } from '../views/OrderView';
import { ProfileView } from '../views/ProfileView';

const BASE_URL = 'https://rapiffy-backend-1.onrender.com';
const LOGIN_API_URL = `${BASE_URL}/v1/auth/login`;

export const AdminLoginController: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'forgot_password' | 'home' | 'category' | 'product' | 'order' | 'profile'>('login');
  const [isInitialChecking, setIsInitialChecking] = useState<boolean>(true);

  // Input states
  const [identityInput, setIdentityInput] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // UI Common States
  const [isPasswordHidden, setIsPasswordHidden] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lockedIdentity, setLockedIdentity] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');
  const [catalogSubCategoryId, setCatalogSubCategoryId] = useState<number | null>(null); 

  // Toast Notification States
  const [loginToastMessage, setLoginToastMessage] = useState<string>('');
  const [loginToastTrigger, setLoginToastTrigger] = useState<number>(0);
  const [resetToastMessage, setResetToastMessage] = useState<string>('');
  const [resetToastTrigger, setResetToastTrigger] = useState<number>(0);

  const flashAnim = useRef(new Animated.Value(0)).current;

  // READ SESSION & RESTORE IDENTITY
  useEffect(() => {
    const checkAuthSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('user_auth_token');
        const storedIdentity = await AsyncStorage.getItem('user_identity');

        if (storedToken) {
          const cleanToken = storedToken.trim();
          setAuthToken(cleanToken);
          
          if (storedIdentity && storedIdentity.trim() !== '') {
            setLockedIdentity(storedIdentity);
          } else {
            setLockedIdentity(identityInput || 'Admin');
          }
          setCurrentScreen('home');
        }
      } catch (error) {
        console.error('Error reading auth token:', error);
      } finally {
        setIsInitialChecking(false);
      }
    };

    checkAuthSession();
  }, []);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('user_auth_token');
      await AsyncStorage.removeItem('user_identity');
      setAuthToken('');
      setLockedIdentity('');
      setIdentityInput('');
      setPassword('');
      setCurrentScreen('login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const showLoginNotification = (message: string) => {
    setLoginToastMessage(message);
    setLoginToastTrigger(prev => prev + 1);
  };

  const showResetNotification = (message: string) => {
    setResetToastMessage(message);
    setResetToastTrigger(prev => prev + 1);
  };

  const triggerFlashTransition = () => {
    Animated.timing(flashAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setCurrentScreen('home');
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleLogin = async () => {
    if (!identityInput.trim() || !password.trim()) {
      showLoginNotification('Please complete fields marked with *');
      return;
    }

    setIsSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); 

    const cleanInput = identityInput.trim();
    const isEmail = cleanInput.includes('@');

    const requestBody = isEmail 
      ? { email: cleanInput, password: password }
      : { phoneNumber: cleanInput, password: password };

    try {
      const response = await fetch(LOGIN_API_URL, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data && data.token) {
        const freshToken = data.token.trim();

        // 1. Storage wipe to avoid stale token retention
        await AsyncStorage.removeItem('user_auth_token');
        await AsyncStorage.setItem('user_auth_token', freshToken);
        await AsyncStorage.setItem('user_identity', cleanInput);

        // 2. Immediate state sync
        setAuthToken(freshToken);
        setLockedIdentity(cleanInput); 
        
        showLoginNotification('Login Successful!');

        setTimeout(() => {
          triggerFlashTransition();
        }, 800);
      } else {
        showLoginNotification(data.message || 'Wrong password or username/email ID.');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        showLoginNotification('Server taking too long. Please try again.');
      } else {
        showLoginNotification('Network error. Check connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordClick = () => {
    if (!identityInput.trim()) {
      showLoginNotification('Please fill out Email or Phone number * first.');
      return;
    }
    setResetToastMessage('');
    setNewPassword('');
    setConfirmPassword('');
    setLockedIdentity(identityInput.trim());
    setCurrentScreen('forgot_password');
  };

  const handleResetSubmit = () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      showResetNotification('Please fill out both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showResetNotification('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      showResetNotification('Password updated successfully!');

      setTimeout(() => {
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
        setIdentityInput('');
        setLoginToastMessage('');
        setCurrentScreen('login');
      }, 2000);
    }, 1500);
  };

  if (isInitialChecking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D2691E" />
      </View>
    );
  }

  const handleNavigate = (screen: 'login' | 'forgot_password' | 'home' | 'category' | 'product' | 'order' | 'profile') => {
    if (screen === 'product') {
      setCatalogSubCategoryId(null);
    }
    setCurrentScreen(screen);
  };

  const openSubCategoryProducts = (subCategoryId: number | null) => {
    setCatalogSubCategoryId(subCategoryId);
    setCurrentScreen('product');
  };

  const renderActiveScreen = () => {
    if (currentScreen === 'home') {
      return <HomeView userCredential={lockedIdentity} onNavigate={handleNavigate} />; 
    }
    if (currentScreen === 'category') {
      return (
        <CategoryView
          mode="categories"
          authToken={authToken}
          onOpenSubCategory={openSubCategoryProducts}
          onNavigate={handleNavigate}
        />
      );
    }
    if (currentScreen === 'product') {
      return (
        <ProductView
          authToken={authToken}
          selectedSubCategoryId={catalogSubCategoryId}
          onOpenSubCategory={setCatalogSubCategoryId}
          onNavigate={handleNavigate}
        />
      );
    }
    if (currentScreen === 'order') {
      return <OrderView onNavigate={handleNavigate} authToken={authToken} />;
    }
    if (currentScreen === 'profile') {
      return <ProfileView onNavigate={handleNavigate} onLogout={handleLogout} />;
    }
    if (currentScreen === 'forgot_password') {
      return (
        <ForgotPasswordView
          newPasswordValue={newPassword}
          onNewPasswordChange={setNewPassword}
          confirmPasswordValue={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
          isPasswordHidden={isPasswordHidden}
          onTogglePasswordVisibility={() => setIsPasswordHidden(!isPasswordHidden)}
          isSubmitting={isSubmitting}
          onPressSubmit={handleResetSubmit}
          onPressBack={() => {
            setLoginToastMessage('');
            setCurrentScreen('login');
          }}
          targetAccount={lockedIdentity}
          toastMessage={resetToastMessage}
          toastTrigger={resetToastTrigger}
        />
      );
    }
    return (
      <AdminLoginView
        usernameValue={identityInput}
        onUsernameChange={setIdentityInput}
        passwordValue={password}
        onPasswordChange={setPassword}
        isPasswordHidden={isPasswordHidden}
        onTogglePasswordVisibility={() => setIsPasswordHidden(!isPasswordHidden)}
        isSubmitting={isSubmitting}
        onPressLogin={handleLogin}
        onPressForgotPassword={handleForgotPasswordClick}
        toastMessage={loginToastMessage}
        toastTrigger={loginToastTrigger}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {renderActiveScreen()}
      <Animated.View 
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: 'rgba(255, 245, 234, 0.92)',
            opacity: flashAnim,
            zIndex: 99999,
          }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF3EB',
  },
});