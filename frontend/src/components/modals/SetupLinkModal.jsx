import AccessLinkModal from './AccessLinkModal.jsx';
import { formatLinkExpiry } from '../../utils/linkExpiry';

export default function SetupLinkModal({ supplier, link, onClose }) {
  const expiryMinutes = supplier.expiryMinutes ?? 10080;
  const expiry = formatLinkExpiry(expiryMinutes);
  const isReset = supplier.linkType === 'reset';
  const expiresAt = supplier.expiresAt ? new Date(supplier.expiresAt).toLocaleString() : '';
  const message = `Hello ${supplier.name},\n\n${isReset ? 'You can reset your Mahindra Supplier Portal password.' : 'Your Mahindra Supplier Portal access is ready.'}\n\n1. Open the secure ${isReset ? 'reset' : 'setup'} link below.\n2. Confirm your PAN and ${isReset ? 'choose a new' : 'create a'} password.\n3. After setup, sign in with your PAN and password.\n\nSign-in PAN: ${supplier.pan}\n${isReset ? 'Reset' : 'Setup'} link: ${link}\n\nFor your security, the ${isReset ? 'reset' : 'setup'} link is valid for ${expiry} from issue and can be used once.${expiresAt ? ` Expires: ${expiresAt}.` : ''} If it expires or you need help, please contact your Mahindra representative.\n\nRegards,\nMahindra Invoice to Payment Support`;
  return <AccessLinkModal name={supplier.name} identity={supplier.pan} identityLabel="PAN" setupLink={link} expiresAt={supplier.expiresAt} expiryMinutes={expiryMinutes} linkType={supplier.linkType ?? 'invite'} message={message} messageLabel="Ready-to-send supplier message" onClose={onClose} />;
}
