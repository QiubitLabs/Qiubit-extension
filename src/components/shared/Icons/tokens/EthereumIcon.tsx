import { IconProps } from '../../Icons';

export const EthereumIcon: React.FC<IconProps> = ({ size = 24, className = '' }) => (
    <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880" alt="ETH" width={size} height={size} className={className} style={{ borderRadius: '50%' }} />
);
