import { motion } from "framer-motion";

interface DiceProps {
  value: number;
  rolling: boolean;
  size?: "sm" | "md" | "lg";
  type?: "d6" | "d50" | "d2";
}

const sizeClasses = {
  sm: "w-12 h-12 text-lg",
  md: "w-16 h-16 text-2xl",
  lg: "w-24 h-24 text-4xl",
};

export function Dice({ value, rolling, size = "md", type = "d6" }: DiceProps) {
  const displayValue = rolling ? "?" : value;
  
  return (
    <motion.div
      className={`
        ${sizeClasses[size]}
        bg-gradient-to-br from-secondary to-muted
        border-2 border-primary/30
        rounded-xl flex items-center justify-center
        font-racing font-bold text-primary
        dice-shadow
        ${rolling ? "animate-pulse" : ""}
      `}
      animate={rolling ? {
        rotateX: [0, 360],
        rotateY: [0, 360],
        scale: [1, 1.1, 1],
      } : {}}
      transition={{
        duration: 0.5,
        repeat: rolling ? Infinity : 0,
      }}
    >
      <span className={rolling ? "opacity-50" : ""}>{displayValue}</span>
    </motion.div>
  );
}

interface DiceResultProps {
  label: string;
  value: number;
  success?: boolean;
}

export function DiceResult({ label, value, success }: DiceResultProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-racing font-bold ${
        success === undefined 
          ? "text-foreground" 
          : success 
            ? "text-green-400" 
            : "text-red-400"
      }`}>
        {value}
      </span>
    </div>
  );
}
