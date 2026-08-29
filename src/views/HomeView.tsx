import React from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  StatusBar, 
  Dimensions,
  TouchableOpacity,
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { LinearGradient, Rect, Defs, Stop, Path } from 'react-native-svg';
import { BottomNavBar, type AppScreen } from '../components/BottomNavBar';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

export interface HomeViewProps {
  userCredential: string;
  onNavigate?: (screen: AppScreen) => void;
}

const blankRowsPlaceholder = [1, 2, 3];

export const HomeView: React.FC<HomeViewProps> = ({ userCredential, onNavigate }) => {
  
  const generateUserGreeting = (input: string): string => {
    const cleanInput = input.trim();
    if (!cleanInput) return 'Hi User';

    if (cleanInput.includes('@')) {
      const parts = cleanInput.split('@');
      let namePart = parts[0];
      namePart = namePart.replace(/[0-9]/g, ''); 
      
      if (namePart.toLowerCase().startsWith('adrika')) {
        namePart = 'adrika';
      }
      return `Hi ${namePart.charAt(0).toUpperCase() + namePart.slice(1)}`;
    }

    const visibleDigits = cleanInput.slice(0, 5);
    return `Hi ${visibleDigits}xxxxx`;
  };

  return (
    <SafeAreaView style={styles.baseContainer} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5E6D3" />

      {/* GRADIENT SHADING LAYER */}
      <View style={styles.backgroundContainer} pointerEvents="none">
        <Svg height={windowHeight * 0.52} width={windowWidth}>
          <Defs>
            <LinearGradient id="pencilMixGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F5E6D3" stopOpacity="1" />
              <Stop offset="0.5" stopColor="#F5E6D3" stopOpacity="0.8" />
              <Stop offset="0.8" stopColor="#F5E6D3" stopOpacity="0.3" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#pencilMixGradient)" />
        </Svg>
      </View>

      {/* HEADER ROW SECTION */}
      <View style={styles.headerRowContainer}>
        <Text style={styles.hiText}>
          {generateUserGreeting(userCredential)}
        </Text>

        <TouchableOpacity 
          style={styles.notificationIconButton}
          onPress={() => console.log('Notification Add pressed')}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2B1E1A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
            <Path d="M15 8h6" />
            <Path d="M18 5v6" />
            <Path d="M20.002 14.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Main Content Dashboard Grid View Stack */}
      <View style={styles.contentAbsoluteContainer}>
        
        {/* CHART CONTAINER LAYOUT */}
        <View style={styles.chartTransparentWrapper}>
          
          {/* BAR 1: ORDER RECEIVED */}
          <View style={[styles.statusIndicatorBar, { height: 280, backgroundColor: '#E6D4BF' }]}>
            <Text style={styles.barLabelText} numberOfLines={1}>Order Received</Text>
          </View>

          {/* BAR 2: DELIVERED */}
          <View style={[styles.statusIndicatorBar, { height: 215, backgroundColor: '#D7C4AE' }]}>
            <Text style={styles.barLabelText} numberOfLines={1}>Delivered</Text>
          </View>

          {/* BAR 3: PENDING */}
          <View style={[styles.statusIndicatorBar, { height: 150, backgroundColor: '#C8B49E' }]}>
            <Text style={styles.barLabelText} numberOfLines={1}>Pending</Text>
          </View>

        </View>

        {/* 5-COLUMN MATRIX STRUCTURE */}
        <View style={styles.tableStructureBox}>
          
          {/* MATRIX HEADER PARAMETERS */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cellText, styles.headerText, styles.vLineBorder, { flex: 1.1 }]}>Action</Text>
            <Text style={[styles.cellText, styles.headerText, styles.vLineBorder, { flex: 1.2 }]}>Order ID</Text>
            <Text style={[styles.cellText, styles.headerText, styles.vLineBorder, { flex: 1.4 }]}>Payment Status</Text>
            <Text style={[styles.cellText, styles.headerText, styles.vLineBorder, { flex: 1.5 }]}>Customer Name</Text>
            <Text style={[styles.cellText, styles.headerText, { flex: 1.0 }]}>Status</Text>
          </View>

          {/* DYNAMIC DATA ROWS ACCORDING TO ORIGINAL LAYOUT */}
          {blankRowsPlaceholder.map((_, index) => (
            <View key={index} style={styles.tableDataRow}>
              <View style={[styles.emptyBodyCell, styles.vLineBorder, { flex: 1.1 }]} />
              <View style={[styles.emptyBodyCell, styles.vLineBorder, { flex: 1.2 }]} />
              <View style={[styles.emptyBodyCell, styles.vLineBorder, { flex: 1.4 }]} />
              <View style={[styles.emptyBodyCell, styles.vLineBorder, { flex: 1.5 }]} />
              <View style={[styles.emptyBodyCell, { flex: 1.0 }]} />
            </View>
          ))}

        </View>
      </View>

      {/* BOTTOM NAV BAR CALLED PROPERLY WITH HOME STATE PARAMETER */}
      <BottomNavBar onNavigate={onNavigate} currentActive="home" />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF', 
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  headerRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 45, 
    zIndex: 5,     
  },
  hiText: {
    fontSize: 22, 
    fontWeight: '900', 
    color: '#2B1E1A', 
    letterSpacing: -0.3,
    flex: 1, 
  },
  notificationIconButton: {
    padding: 6, 
    marginLeft: 16,
  },
  contentAbsoluteContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 105, 
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 5,
  },
  chartTransparentWrapper: {
    paddingHorizontal: 4,
    marginBottom: 24,
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    justifyContent: 'flex-start', 
  },
  statusIndicatorBar: {
    width: 65, 
    marginRight: 8, 
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2B1E1A',
    textAlign: 'center',
    position: 'absolute', 
    width: 150,           
    transform: [{ rotate: '-90deg' }], 
  },
  tableStructureBox: {
    backgroundColor: '#FFFBF7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0E2D3',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F5E6D3',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E6D4BF',
  },
  tableDataRow: {
    flexDirection: 'row',
    height: 85, 
  },
  cellText: {
    fontSize: 10.5,
    color: '#2B1E1A',
    textAlign: 'center', 
  },
  headerText: {
    fontWeight: '800',
    color: '#5C4033',
  },
  vLineBorder: {
    borderRightWidth: 1,
    borderRightColor: '#E6D4BF', 
  },
  emptyBodyCell: {
    height: '100%',
    backgroundColor: 'transparent',
  }
});