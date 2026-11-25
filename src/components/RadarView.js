import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing, AccessibilityInfo } from 'react-native';
import { useTheme } from '../theme';

const AnimatedView = /** @type {any} */ (Animated.View);

const SWEEP_DURATION = 3500;
const PULSE_DURATION = 2600;
const TICK_COUNT = 24;

/**
 * High-tech sonar radar visualisation with a rotating sweep arm, two staggered
 * expanding pulse rings, cardinal crosshairs, degree ticks and range labels.
 * @param {object} props
 * @param {boolean} [props.active=true] - Whether the sweep and pulses animate.
 * @param {number} [props.size=260] - Diameter of the radar container.
 * @param {React.ReactNode} [props.children] - Nodes positioned over the radar.
 */
export default function RadarView({ active = true, size = 260, children }) {
  const { theme } = useTheme();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const beaconAnim = useRef(new Animated.Value(1)).current;
  const pulseOne = useRef(new Animated.Value(0)).current;
  const pulseTwo = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(/** @type {any} */ (null));
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reducedMotionRef.current = Boolean(enabled);
      })
      .catch((err) => {
        // Accessibility probe unavailable on this platform; keep animation enabled.
        reducedMotionRef.current = false;
        // eslint-disable-next-line no-console
        console.warn('Reduce-motion probe failed:', err.message);
      });
  }, []);

  useEffect(() => {
    const stopAll = () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };

    if (!active || reducedMotionRef.current) {
      stopAll();
      rotateAnim.setValue(0);
      beaconAnim.setValue(1);
      pulseOne.setValue(0);
      pulseTwo.setValue(0);
      return stopAll;
    }

    const sweep = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: SWEEP_DURATION,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    const beacon = Animated.loop(
      Animated.sequence([
        Animated.timing(beaconAnim, {
          toValue: 1.18,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(beaconAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );

    // Two rings, half a cycle apart, so a new pulse is always radiating out.
    const ringOne = Animated.loop(
      Animated.timing(pulseOne, {
        toValue: 1,
        duration: PULSE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      })
    );
    const ringTwo = Animated.loop(
      Animated.sequence([
        Animated.delay(PULSE_DURATION / 2),
        Animated.timing(pulseTwo, {
          toValue: 1,
          duration: PULSE_DURATION,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        })
      ])
    );

    animationRef.current = Animated.parallel([sweep, beacon, ringOne, ringTwo]);
    animationRef.current.start();

    return stopAll;
  }, [active, rotateAnim, beaconAnim, pulseOne, pulseTwo]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const pulseRingStyle = (value) => ({
    transform: [
      {
        scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] })
      }
    ],
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] })
  });

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => i);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer range ring */}
      <View
        style={[styles.ring, { width: size, height: size, borderColor: theme.colors.borderHighlight }]}
      />
      {/* Expanding sonar pulses */}
      {active ? (
        <>
          <AnimatedView
            pointerEvents="none"
            style={[
              styles.pulseRing,
              { width: size, height: size, borderColor: theme.colors.primary },
              pulseRingStyle(pulseOne)
            ]}
          />
          <AnimatedView
            pointerEvents="none"
            style={[
              styles.pulseRing,
              { width: size, height: size, borderColor: theme.colors.accent },
              pulseRingStyle(pulseTwo)
            ]}
          />
        </>
      ) : null}

      {/* Range rings */}
      <View
        style={[styles.ring, { width: size * 0.66, height: size * 0.66, borderColor: theme.colors.primaryGlow }]}
      />
      <View
        style={[styles.ring, { width: size * 0.33, height: size * 0.33, borderColor: theme.colors.border }]}
      />

      {/* Degree tick marks around the rim */}
      {ticks.map((i) => (
        <View
          key={`tick-${i}`}
          pointerEvents="none"
          style={[styles.tickAnchor, { width: size, height: size, transform: [{ rotate: `${(360 / TICK_COUNT) * i}deg` }] }]}
        >
          <View
            style={[
              styles.tick,
              {
                height: i % 6 === 0 ? 9 : 4,
                backgroundColor: i % 6 === 0 ? theme.colors.primary : theme.colors.textMuted
              }
            ]}
          />
        </View>
      ))}

      {/* Cardinal crosshairs */}
      <View style={[styles.crosshairH, { width: size, backgroundColor: theme.colors.border }]} />
      <View style={[styles.crosshairV, { height: size, backgroundColor: theme.colors.border }]} />

      {/* Range labels along the vertical axis */}
      <Text style={[styles.rangeLabel, styles.rangeNear, { color: theme.colors.textMuted }]}>NEAR</Text>
      <Text style={[styles.rangeLabel, styles.rangeLan, { color: theme.colors.textMuted }]}>LAN</Text>
      <Text style={[styles.rangeLabel, styles.rangeSubnet, { color: theme.colors.textMuted }]}>SUBNET</Text>

      {/* Rotating sweep arm */}
      {active ? (
        <AnimatedView
          pointerEvents="none"
          style={[styles.sweepArmContainer, { width: size, height: size, transform: [{ rotate: spin }] }]}
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

      {/* Center beacon */}
      <AnimatedView
        style={[
          styles.centerBeacon,
          {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            transform: [{ scale: beaconAnim }]
          }
        ]}
      />

      {/* Peer overlays */}
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
  pulseRing: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 2
  },
  tickAnchor: {
    position: 'absolute',
    alignItems: 'center'
  },
  tick: {
    width: 1.5,
    borderRadius: 1,
    marginTop: 2
  },
  crosshairH: {
    position: 'absolute',
    height: 1
  },
  crosshairV: {
    position: 'absolute',
    width: 1
  },
  rangeLabel: {
    position: 'absolute',
    left: '50%',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginLeft: 6
  },
  rangeNear: {
    top: '42%'
  },
  rangeLan: {
    top: '22%'
  },
  rangeSubnet: {
    top: '2%'
  },
  sweepArmContainer: {
    position: 'absolute',
    alignItems: 'center'
  },
  sweepArm: {
    width: 2.5,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3
  },
  centerBeacon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4
  }
});
