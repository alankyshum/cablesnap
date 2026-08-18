import { curveLinear, curveMonotoneX, curveNatural } from 'd3-shape';
import type { CurveType } from './types';

export function curveFor(type: CurveType = 'natural') {
  if (type === 'linear') return curveLinear;
  if (type === 'monotoneX') return curveMonotoneX;
  return curveNatural;
}
