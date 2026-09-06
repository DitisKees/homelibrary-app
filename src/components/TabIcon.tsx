import React from 'react';
import { StyleSheet, View } from 'react-native';

type TabIconKind = 'library' | 'reading' | 'lending' | 'add';

type TabIconProps = {
  kind: TabIconKind;
  color: string;
  size: number;
  focused: boolean;
};

export default function TabIcon({ kind, color, size, focused }: TabIconProps) {
  const scale = size / 24;
  const line = focused ? Math.max(2, 2.25 * scale) : Math.max(1.5, 1.75 * scale);
  const box = { width: size, height: size };

  if (kind === 'library') {
    return (
      <View style={[styles.icon, box]} accessible={false}>
        <View style={[styles.bookSpine, { left: 2 * scale, top: 5 * scale, width: 5 * scale, height: 16 * scale, borderColor: color, borderWidth: line, backgroundColor: focused ? color : 'transparent' }]} />
        <View style={[styles.bookSpine, { left: 9 * scale, top: 3 * scale, width: 5 * scale, height: 18 * scale, borderColor: color, borderWidth: line, backgroundColor: focused ? color : 'transparent' }]} />
        <View style={[styles.bookSpine, styles.tiltedBook, { left: 16 * scale, top: 4 * scale, width: 5 * scale, height: 17 * scale, borderColor: color, borderWidth: line, backgroundColor: focused ? color : 'transparent' }]} />
      </View>
    );
  }

  if (kind === 'reading') {
    return (
      <View style={[styles.icon, box]} accessible={false}>
        <View style={[styles.page, styles.leftPage, { left: 2 * scale, top: 4 * scale, width: 10 * scale, height: 16 * scale, borderColor: color, borderWidth: line }]} />
        <View style={[styles.page, styles.rightPage, { right: 2 * scale, top: 4 * scale, width: 10 * scale, height: 16 * scale, borderColor: color, borderWidth: line }]} />
        <View style={[styles.bookCenter, { left: 11.25 * scale, top: 5 * scale, width: line, height: 14 * scale, backgroundColor: color }]} />
      </View>
    );
  }

  if (kind === 'lending') {
    return (
      <View style={[styles.icon, box]} accessible={false}>
        <View style={[styles.arrowLine, { left: 3 * scale, top: 7 * scale, width: 16 * scale, height: line, backgroundColor: color }]} />
        <View style={[styles.arrowHead, { right: 3 * scale, top: 4 * scale, width: 7 * scale, height: 7 * scale, borderTopWidth: line, borderRightWidth: line, borderColor: color }]} />
        <View style={[styles.arrowLine, { left: 5 * scale, top: 16 * scale, width: 16 * scale, height: line, backgroundColor: color }]} />
        <View style={[styles.arrowHead, styles.arrowHeadLeft, { left: 3 * scale, top: 13 * scale, width: 7 * scale, height: 7 * scale, borderTopWidth: line, borderRightWidth: line, borderColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.addCircle, box, { borderColor: color, borderWidth: line, backgroundColor: focused ? `${color}18` : 'transparent' }]} accessible={false}>
      <View style={{ position: 'absolute', width: 11 * scale, height: line, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: line, height: 11 * scale, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'relative' },
  bookSpine: { position: 'absolute', borderRadius: 1 },
  tiltedBook: { transform: [{ rotate: '-8deg' }] },
  page: { position: 'absolute', backgroundColor: 'transparent' },
  leftPage: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderRightWidth: 0 },
  rightPage: { borderTopRightRadius: 4, borderBottomRightRadius: 4, borderLeftWidth: 0 },
  bookCenter: { position: 'absolute', borderRadius: 999 },
  arrowLine: { position: 'absolute', borderRadius: 999 },
  arrowHead: { position: 'absolute', transform: [{ rotate: '45deg' }] },
  arrowHeadLeft: { transform: [{ rotate: '-135deg' }] },
  addCircle: { position: 'relative', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
});
