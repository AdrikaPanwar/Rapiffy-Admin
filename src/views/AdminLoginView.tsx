import React, { useEffect, useRef } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { styles } from './AdminLoginStyles';

const { width: windowWidth } = Dimensions.get('window');

export interface AdminLoginViewProps {
  usernameValue: string;
  onUsernameChange: (text: string) => void;
  passwordValue: string;
  onPasswordChange: (text: string) => void;
  isPasswordHidden: boolean;
  onTogglePasswordVisibility: () => void;
  isSubmitting: boolean;
  onPressLogin: () => void;
  onPressForgotPassword: () => void;
  toastMessage: string;
  toastTrigger: number;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  usernameValue,
  onUsernameChange,
  passwordValue,
  onPasswordChange,
  isPasswordHidden,
  onTogglePasswordVisibility,
  isSubmitting,
  onPressLogin,
  onPressForgotPassword,
  toastMessage,
  toastTrigger,
}) => {
  const slideAnim = useRef(new Animated.Value(windowWidth)).current;

  useEffect(() => {
    if (toastTrigger > 0 && toastMessage) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: windowWidth,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, 2500);
      });
    }
  }, [toastTrigger]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: '#F5E6D3' }]} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5E6D3" />
        
        {/* EXACT FIXED SCALING: 100% Screenshot 2 jaisa original layout pattern */}
        <View style={styles.topShapeContainer} pointerEvents="none">
          <Svg height={160} width={windowWidth} viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path d="M0,0 C35,0 45,20 20,60 C8,80 0,85 0,100 Z" fill="#D2691E" opacity="0.85" />
          </Svg>
        </View>

        {/* Edge-Attached Theme Notification Panel */}
        <Animated.View style={{
          position: 'absolute',
          top: 60,
          right: 0,                      
          maxWidth: windowWidth * 0.65,  
          backgroundColor: '#FFF5EA', 
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderTopLeftRadius: 10,      
          borderBottomLeftRadius: 10,
          borderTopRightRadius: 0,      
          borderBottomRightRadius: 0,
          borderLeftWidth: 4,
          borderLeftColor: '#D2691E', 
          zIndex: 999,
          transform: [{ translateX: slideAnim }],
          shadowColor: '#2B1E1A',
          shadowOffset: { width: -2, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 4,
        }}>
          <Text style={{ 
            color: '#D2691E', 
            fontSize: 13, 
            fontWeight: '700', 
            textAlign: 'left' 
          }}>
            {toastMessage}
          </Text>
        </Animated.View>

        <View style={styles.absoluteCenterCard}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>
              Rap<Text style={styles.logoTextHighlight}>i</Text>ffy
            </Text>
            <View style={styles.orangeUnderline} />
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputWrapper}>
              <User color="#5C4033" size={22} style={styles.inputIcon} />
              <TextInput
                style={styles.inputField}
                placeholder="Email ID or Phone number *"
                placeholderTextColor="#998877"
                value={usernameValue}
                onChangeText={onUsernameChange}
                autoCapitalize="none"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Lock color="#5C4033" size={22} style={styles.inputIcon} />
              <TextInput
                style={styles.inputField}
                placeholder="Password"
                placeholderTextColor="#998877"
                secureTextEntry={isPasswordHidden}
                value={passwordValue}
                onChangeText={onPasswordChange}
                autoCapitalize="none"
                editable={!isSubmitting}
              />
              <TouchableOpacity onPress={onTogglePasswordVisibility} style={styles.eyeIconWrapper}>
                {isPasswordHidden ? <Eye color="#2B1E1A" size={22} /> : <EyeOff color="#2B1E1A" size={22} />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onPressForgotPassword} style={styles.forgotPasswordWrapper}>
              <Text style={styles.forgotPasswordText}>Forgot password ?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]} onPress={onPressLogin} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Login</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* EXACT FIXED SCALING: Screenshot 2 bottom layout design signature matches perfectly */}
        <View style={styles.bottomShapeContainer} pointerEvents="none">
          <Svg height={120} width={windowWidth} viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path d="M100,100 C65,100 55,65 75,35 C90,15 100,8 100,0 Z" fill="#5C2E0B" />
          </Svg>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};