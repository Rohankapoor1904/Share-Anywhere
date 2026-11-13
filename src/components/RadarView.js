import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, AccessibilityInfo } from 'react-native';

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Animated radar sweep visualization representing active local discovery.
 * @param {object} props
 * @param {boolean} [props.active=true] - Whether sweep animation is active.
 * @param {number} [props.size=260] - Diameter of the radar container.
 * @param {React.ReactNode} [props.children] - Nodes positioned over the radar.
 */
export default function RadarView({ active = true, size = 260, children }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animationRef = useRef(null);

  useEffect(() => {
    let isReducedMotion = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      isReducedMotion = enabled;
    }).catch(() => {
      isReducedMotion = false;
    });

    if (!active || isReducedMotion) {
      rotateAnim.setValue(0);
      pulseAnim.setValue(1);
      return () => {};
    }

    const sweep = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3500,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    animationRef.current = Animated.parallel([sweep, pulse]);
    animationRef.current.start();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [active, rotateAnim, pulseAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Concentric rings */}
      <View style={[styles.ring, styles.ringOuter, { width: size, height: size }]} />
      <View style={[styles.ring, styles.ringMiddle, { width: size * 0.66, height: size * 0.66 }]} />
      <View style={[styles.ring, styles.ringInner, { width: size * 0.33, height: size * 0.33 }]} />

      {/* Crosshairs */}
      <View style={[styles.crosshairH, { width: size }]} />
      <View style={[styles.crosshairV, { height: size }]} />

      {/* Sweep Arm */}
      {active ? (
        <AnimatedView
          style={[
            styles.sweepArmContainer,
            { width: size, height: size, transform: [{ rotate: spin }] }
          ]}
        >
          <View style={[styles.sweepArm, { height: size / 2 }]} />
        </AnimatedView>
      ) : null}

      {/* Center Beacon */}
      <AnimatedView
        style={[
          styles.centerBeacon,
          { transform: [{ scale: pulseAnim }] }
        ]}
      />

      {/* Children overlays (peers, radar blips) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 20
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)'
  },
  ringOuter: {
    borderColor: 'rgba(56, 189, 248, 0.25)'
  },
  ringMiddle: {
    borderColor: 'rgba(56, 189, 248, 0.18)'
  },
  ringInner: {
    borderColor: 'rgba(56, 189, 248, 0.12)'
  },
  crosshairH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.1)'
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.1)'
  },
  sweepArmContainer: {
    position: 'absolute',
    alignItems: 'center'
  },
  sweepArm: {
    width: 2,
    backgroundColor: 'rgba(56, 189, 248, 0.8)',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8
  },
  centerBeacon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10
  }
});
