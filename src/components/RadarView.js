import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, AccessibilityInfo } from 'react-native';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Animated themed radar sweep visualization representing active local discovery.
 * @param {object} props
 * @param {boolean} [props.active=true] - Whether sweep animation is active.
 * @param {number} [props.size=260] - Diameter of the radar container.
 * @param {React.ReactNode} [props.children] - Nodes positioned over the radar.
 */
export default function RadarView({ active = true, size = 260, children }) {
  const { theme } = useTheme();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animationRef = useRef(null);

  useEffect(() => {
    let isReducedMotion = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        isReducedMotion = enabled;
      })
      .catch(() => {
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
          toValue: 1.15,
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
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderColor: theme.colors.borderHighlight
          }
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size * 0.66,
            height: size * 0.66,
            borderColor: theme.colors.primaryGlow
          }
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size * 0.33,
            height: size * 0.33,
            borderColor: theme.colors.border
          }
        ]}
      />

      {/* Crosshairs */}
      <View style={[styles.crosshairH, { width: size, backgroundColor: theme.colors.border }]} />
      <View style={[styles.crosshairV, { height: size, backgroundColor: theme.colors.border }]} />

      {/* Sweep Arm */}
      {active ? (
        <AnimatedView
          style={[
            styles.sweepArmContainer,
            { width: size, height: size, transform: [{ rotate: spin }] }
          ]}
        >
          <View
            style={[
              styles.sweepArm,
              {
                height: size / 2,
                backgroundColor: theme.colors.primary,
                shadowColor: theme.colors.primary
              }
            ]}
          />
        </AnimatedView>
      ) : null}

      {/* Center Beacon */}
      <AnimatedView
        style={[
          styles.centerBeacon,
          {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            transform: [{ scale: pulseAnim }]
          }
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
    borderWidth: 1
  },
  crosshairH: {
    position: 'absolute',
    height: 1
  },
  crosshairV: {
    position: 'absolute',
    width: 1
  },
  sweepArmContainer: {
    position: 'absolute',
    alignItems: 'center'
  },
  sweepArm: {
    width: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8
  },
  centerBeacon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10
  }
});
