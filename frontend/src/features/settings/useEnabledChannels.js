import { useSelector } from 'react-redux';
import { CHANNELS, DEFAULT_CHANNEL_AVAILABILITY } from '../../data/constants';

export default function useEnabledChannels() {
  const availability = useSelector((state) => state.settings.channelAvailability);
  return CHANNELS.filter((channel) => (availability ?? DEFAULT_CHANNEL_AVAILABILITY)[channel.key] !== false);
}
