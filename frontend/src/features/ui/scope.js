import { useSelector } from 'react-redux';
import { getFiscalYear } from '../../utils/businessLogic';

/** The top-bar scope every screen shares: fiscal year, channel and vendor code.
 *  fy is the chosen year, 'all' for every year, or the current fiscal year until one is chosen. */
export const currentFiscalYear = () => getFiscalYear(new Date().toISOString());

export function resolveScope(scope) {
  const raw = scope || {};
  return {
    fy: raw.fy || currentFiscalYear(),
    fyChosen: !!raw.fy,
    channel: raw.channel || '',
    vcode: raw.vcode || '',
  };
}

export const selectScope = (state) => state.ui.scope;

export function useScope() {
  return resolveScope(useSelector(selectScope));
}
