import { StyleSheet, Dimensions, Platform } from 'react-native';

const { height: windowHeight } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FAF3EB', 
    position: 'relative',
  },
  absoluteCenterCard: {
    position: 'absolute',
    top: (windowHeight / 2) - 220, 
    left: 32,
    right: 32,
    zIndex: 5,
  },
  centerWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 5,
  },
  topShapeContainer: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    zIndex: 1, 
  },
  bottomShapeContainer: { 
    position: 'absolute', 
    top: windowHeight - 120, 
    left: 0, 
    right: 0, 
    zIndex: 1, 
  },
  logoContainer: { 
    alignItems: 'center', 
    marginBottom: 45, 
  },
  logoText: { 
    fontSize: 56, 
    fontWeight: 'bold', 
    color: '#2B1E1A', 
    letterSpacing: -1, 
  },
  logoTextHighlight: { 
    color: '#D2691E', 
  },
  orangeUnderline: { 
    width: 24, 
    height: 3, 
    backgroundColor: '#D2691E', 
    marginTop: -4, 
    borderRadius: 2, 
    marginBottom: 8, 
  },
  tagline: { 
    fontSize: 18, 
    color: '#5C4033', 
    letterSpacing: 0.5, 
    fontWeight: '500', 
  },
  formContainer: { 
    width: '100%', 
    marginBottom: 15, 
  },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    marginBottom: 16, 
    paddingHorizontal: 20, 
    height: 60, 
    ...Platform.select({
      ios: {
        shadowColor: '#2B1E1A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  inputIcon: { 
    marginRight: 14, 
  },
  inputField: { 
    flex: 1, 
    fontSize: 16, 
    color: '#2B1E1A', 
    fontWeight: '500', 
  },
  eyeIconWrapper: { 
    padding: 4, 
  },
  forgotPasswordWrapper: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  forgotPasswordText: {
    color: '#7C5A43',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: { 
    backgroundColor: '#D2691E', 
    borderRadius: 16, 
    height: 56, 
    justifyContent: 'center', 
    alignItems: 'center', 
  },
  buttonDisabled: { 
    opacity: 0.6, 
  },
  primaryButtonText: { 
    color: '#FFFFFF', 
    fontSize: 17, 
    fontWeight: '600', 
  },
});