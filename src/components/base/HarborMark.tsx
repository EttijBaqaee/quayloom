/** Original geometric harbor / dialogue mark: piers, a central beacon and a speech dock. */
export function HarborMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="harbor-mark" width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="42" height="42" rx="12" fill="currentColor" fillOpacity=".1" />
      <path d="M12 14H19V27H29V14H36V31H22L15 37V31H12V14Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 12V22M21 15H27M29 37H36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
