import React from 'react';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '../theme';
import { ICON_PATHS } from './iconPaths';

/**
 * Render one shape descriptor from ICON_PATHS.
 * @param {import('./iconPaths').IconShape} shape
 * @param {string} key
 * @param {number} strokeWidth
 */
function renderShape(shape, key, strokeWidth) {
  /** @type {{ strokeWidth: number, strokeLinecap: 'round', strokeLinejoin: 'round' }} */
  const common = { strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (shape.t) {
    case 'path':
      return <Path key={key} d={shape.d} fill="none" {...common} />;
    case 'rect':
      return (
        <Rect
          key={key}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx || 0}
          fill="none"
          {...common}
        />
      );
    case 'circle':
      return <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill="none" {...common} />;
    case 'line':
      return <Line key={key} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} fill="none" {...common} />;
    case 'polyline':
      return <Polyline key={key} points={shape.points} fill="none" {...common} />;
    default:
      return null;
  }
}

/**
 * Crisp vector icon drawn from the LocalShare icon set.
 * @param {object} props
 * @param {string} props.name - Icon identifier from ICON_PATHS.
 * @param {number} [props.size=24] - Square dimension in dp.
 * @param {string} [props.color] - Stroke color; defaults to the theme's primary text color.
 * @param {number} [props.strokeWidth=2] - Stroke weight on the 24x24 grid.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 */
export default function Icon({ name, size = 24, color, strokeWidth = 2, style }) {
  const { theme } = useTheme();
  const shapes = ICON_PATHS[name] || ICON_PATHS.file;
  const stroke = color || theme.colors.text;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke={stroke}
      style={style}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      {shapes.map((shape, idx) => renderShape(shape, `${name}-${idx}`, strokeWidth))}
    </Svg>
  );
}
