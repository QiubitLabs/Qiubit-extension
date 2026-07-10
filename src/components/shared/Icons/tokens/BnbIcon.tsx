import { IconProps } from "../../Icons";

export const BnbIcon: React.FC<IconProps> = ({ size = 24, className = "" }) => (
  <img
    src="https://assets.coingecko.com/coins/images/825/small/binance-coin-logo.png?1547034615"
    alt="BNB"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%" }}
  />
);
