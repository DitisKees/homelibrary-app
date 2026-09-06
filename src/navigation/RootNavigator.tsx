import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import TabIcon from '@/components/TabIcon';
import { useAuth } from '@/context/AuthContext';

import LoginScreen from '@/screens/LoginScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import MyReadingScreen from '@/screens/MyReadingScreen';
import LendingScreen from '@/screens/LendingScreen';
import AddBookScreen from '@/screens/AddBookScreen';
import BookDetailScreen from '@/screens/BookDetailScreen';
import EditBookScreen from '@/screens/EditBookScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import StatisticsScreen from '@/screens/StatisticsScreen';
import ServerSetupScreen from '@/screens/ServerSetupScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function AppTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        tabBarActiveTintColor: '#1f6feb',
        tabBarInactiveTintColor: '#6b7280',
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { minHeight: 60, paddingTop: 4, paddingBottom: 4 },
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('navigation.openStatistics')}
              hitSlop={8}
              onPress={() => navigation.getParent()?.navigate('Statistics')}
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                paddingVertical: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#1f6feb', fontSize: 22, fontWeight: '700' }}>▥</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('navigation.openSettings')}
              hitSlop={8}
              onPress={() => navigation.getParent()?.navigate('Settings')}
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                paddingVertical: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#1f6feb', fontSize: 15, fontWeight: '700' }}>
                {t('navigation.settings')}
              </Text>
            </Pressable>
          </View>
        ),
      })}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          title: t('navigation.library'),
          tabBarAccessibilityLabel: t('navigation.libraryTab'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon kind="library" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="MyReading"
        component={MyReadingScreen}
        options={{
          title: t('navigation.myReading'),
          tabBarAccessibilityLabel: t('navigation.myReadingTab'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon kind="reading" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Lending"
        component={LendingScreen}
        options={{
          title: t('navigation.lending'),
          tabBarAccessibilityLabel: t('navigation.lendingTab'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon kind="lending" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Add"
        component={AddBookScreen}
        options={{
          title: t('navigation.add'),
          tabBarAccessibilityLabel: t('navigation.addBookTab'),
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon kind="add" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppStack() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="BookDetail"
        component={BookDetailScreen}
        options={{ title: t('navigation.book') }}
      />
      <Stack.Screen
        name="EditBook"
        component={EditBookScreen}
        options={{ title: t('navigation.editBook') }}
      />
      <Stack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{ title: t('navigation.statistics') }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('navigation.settings') }}
      />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, endpoint, isReady } = useAuth();
  const { t } = useTranslation();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel={t('navigation.loadingApp')} />
      </View>
    );
  }

  if (!endpoint) return <ServerSetupScreen />;

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <LoginScreen />}
    </NavigationContainer>
  );
}
