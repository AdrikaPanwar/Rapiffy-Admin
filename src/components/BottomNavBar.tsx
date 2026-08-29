import React from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Platform 
} from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export type AppScreen = 'login' | 'forgot_password' | 'home' | 'category' | 'product' | 'order' | 'profile';

export interface BottomNavBarProps {
  onNavigate?: (screen: AppScreen) => void;
  currentActive?: 'home' | 'category' | 'product' | 'order' | 'profile' | string;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ onNavigate, currentActive }) => {
  return (
    <View style={styles.navBarWrapper}>
      <View style={styles.rectangleContainer}>
        
        {/* COMPONENT 1: HOME */}
        <TouchableOpacity 
          style={styles.navIconButton}
          onPress={() => onNavigate && onNavigate('home')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={currentActive === 'home' ? '#D2691E' : '#2B1E1A'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <Path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </Svg>
          <Text style={[styles.navLabelText, currentActive === 'home' && { color: '#D2691E' }]}>Home</Text>
        </TouchableOpacity>

        {/* COMPONENT 2: CATEGORY */}
        <TouchableOpacity 
          style={styles.navIconButton} 
          onPress={() => onNavigate && onNavigate('category')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={currentActive === 'category' ? '#D2691E' : '#2B1E1A'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Rect width="7" height="7" x={3} y={3} rx={1} />
            <Rect width="7" height="7" x={14} y={3} rx={1} />
            <Rect width="7" height="7" x={14} y={14} rx={1} />
            <Rect width="7" height="7" x={3} y={14} rx={1} />
          </Svg>
          <Text style={[styles.navLabelText, currentActive === 'category' && { color: '#D2691E' }]}>Category</Text>
        </TouchableOpacity>

        {/* COMPONENT 3: PRODUCT */}
        <TouchableOpacity 
          style={styles.navIconButton} 
          onPress={() => onNavigate && onNavigate('product')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={currentActive === 'product' ? '#D2691E' : '#2B1E1A'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Rect width="18" height="18" x={3} y={3} rx={2} />
            <Path d="M7 7h.01" />
            <Path d="M17 7h.01" />
            <Path d="M7 17h.01" />
            <Path d="M17 17h.01" />
          </Svg>
          <Text style={[styles.navLabelText, currentActive === 'product' && { color: '#D2691E' }]}>Product</Text>
        </TouchableOpacity>

        {/* COMPONENT 4: ORDER */}
        <TouchableOpacity 
          style={styles.navIconButton} 
          onPress={() => onNavigate && onNavigate('order')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={currentActive === 'order' ? '#D2691E' : '#2B1E1A'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 5h10" />
            <Path d="M11 12h10" />
            <Path d="M11 19h10" />
            <Path d="M4 4h1v5" />
            <Path d="M4 9h2" />
            <Path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
          </Svg>
          <Text style={[styles.navLabelText, currentActive === 'order' && { color: '#D2691E' }]}>Order</Text>
        </TouchableOpacity>

        {/* COMPONENT 5: PROFILE */}
        <TouchableOpacity 
          style={styles.navIconButton} 
          onPress={() => onNavigate && onNavigate('profile')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={currentActive === 'profile' ? '#D2691E' : '#2B1E1A'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Path d="m19 16-3 3" />
            <Path d="M2 21a8 8 0 0 1 12.664-6.5" />
            <Path d="M22 19h-6l3 3" />
            <Circle cx={10} cy={8} r={5} />
          </Svg>
          <Text style={[styles.navLabelText, currentActive === 'profile' && { color: '#D2691E' }]}>Profile</Text>
        </TouchableOpacity>
        
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navBarWrapper: {
    position: 'absolute',
    bottom: 0, 
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 10,
  },
  rectangleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFBF7', 
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 48 : 36, 
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#F0E2D3', 
    ...Platform.select({
      ios: {
        shadowColor: '#5C4033',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  navIconButton: {
    paddingTop: 4,
    paddingBottom: 2,
    alignItems: 'center',
    minWidth: 60,
  },
  navLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2B1E1A',
    marginTop: 3,
  },
});