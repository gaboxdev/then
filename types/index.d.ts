export type Usage = 'none' | 'low' | 'medium' | 'high'
export type Option = { title: string; detail: string; usage?: Usage }
export type PlanBar = { state?: string; note?: string | null; isFolded?: boolean; agents?: { state?: string }[] }
export type Offer = { title: string; options: Option[]; at: number; suggested?: number | null; isFree?: boolean }

declare module 'claude-code' {
  interface PluginState {
    then: { offer: Offer | null; isOn: boolean; color: string | null; selected: number[] | null; theme: string | null; last: Offer | null; waiting: string[] | null }
    // read only, to size the band when plan-progress draws its bars above it
    'plan-progress': { plans: PlanBar[]; isOpen: boolean }
  }
}
