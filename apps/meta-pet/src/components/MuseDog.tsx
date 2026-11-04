import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Kai's separate plush arm lets her wave without rocking the whole illustration. */
export function MuseDog({ style }: { style?: StyleProp<ViewStyle> }) {
  const [wave] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [size, setSize] = useState(0);
  const [loaded, setLoaded] = useState({ body: false, paw: false });

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const greeting = useCallback(() => {
    const turn = (toValue: number, duration: number) => Animated.timing(wave, {
      toValue, duration, easing: Easing.inOut(Easing.sin),
      useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    return Animated.sequence([
      turn(-1, 200), turn(1, 310), turn(-1, 310),
      turn(1, 310), turn(-1, 310), turn(0, 220),
    ]);
  }, [wave]);

  useEffect(() => {
    animation.current?.stop();
    wave.setValue(0);
    if (reducedMotion) return;
    const loop = Animated.loop(Animated.sequence([greeting(), Animated.delay(4200)]));
    animation.current = loop;
    loop.start();
    return () => animation.current?.stop();
  }, [greeting, reducedMotion, wave]);

  function sayHello() {
    AccessibilityInfo.announceForAccessibility('Kai says hello!');
    if (reducedMotion) return;
    animation.current?.stop();
    wave.setValue(0);
    const next = Animated.loop(Animated.sequence([greeting(), Animated.delay(4200)]));
    animation.current = next;
    next.start();
  }

  // Match the approved plush animation's 1024-square artboard and shoulder pivot.
  const scale = size / 1024;
  return <Pressable accessibilityRole="button" accessibilityLabel="Wave hello to Kai"
    accessibilityHint="Kai waves her paw back at you" onPress={sayHello} style={style}
    onLayout={event => setSize(Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height))}>
    <View pointerEvents="none" style={[styles.stage, { width: size, height: size, opacity: loaded.body && loaded.paw ? 1 : 0 }]}>
      <Animated.Image source={require('../../assets/kai-plush-paw.png')} resizeMode="contain"
        onLoad={() => setLoaded(previous => ({ ...previous, paw: true }))}
        style={{ position: 'absolute', width: 183.75 * scale, height: 238.5 * scale,
          left: 610 * scale, top: 337 * scale, transformOrigin: [60 * scale, 203 * scale, 0],
          transform: [{ rotate: wave.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-18deg', '0deg', '18deg'] }) }] }} />
      <Image source={require('../../assets/kai-plush-body.png')} resizeMode="contain"
        onLoad={() => setLoaded(previous => ({ ...previous, body: true }))}
        style={{ position: 'absolute', left: 200 * scale, top: 80 * scale, width: 509.6 * scale, height: 846.72 * scale }} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({ stage: { alignSelf: 'center', marginTop: 'auto' } });
