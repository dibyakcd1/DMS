import { cva, type VariantProps } from "class-variance-authority"

export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-rose-500/30 bg-rose-500/10 text-rose-600 backdrop-blur-sm",
        outline: "border-border/50 glass-card text-foreground",
        glass: "border-white/20 bg-white/10 text-white backdrop-blur-md shadow-inner",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 backdrop-blur-sm",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-600 backdrop-blur-sm",
        info: "border-blue-500/30 bg-blue-500/10 text-blue-600 backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeVariantProps = VariantProps<typeof badgeVariants>
