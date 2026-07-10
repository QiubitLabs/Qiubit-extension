import { IconProps } from "../../Icons";

export const SolanaIcon: React.FC<IconProps> = ({
  size = 24,
  className = "",
}) => (
  <img
    src="https://assets.coingecko.com/coins/images/4128/small/solana.png?1640133422"
    alt="SOL"
    width={size}
    height={size}
    className={className}
    style={{ borderRadius: "50%" }}
  />
);
