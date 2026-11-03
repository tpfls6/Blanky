import { useLayoutEffect, useRef, useState } from 'react'
import { TemplatePreview } from '../Custom/TemplatePreview.tsx'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { TemplatePreviewProvider } from '../../features/marketplace/preview.tsx'
import type { TemplateListing } from '../../features/marketplace/schema.ts'

// The real template rendered at desktop width, then scaled down to the card.
const STAGE = 720

export function TemplateThumbnail({ listing }: { listing: TemplateListing }) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const node = frame.current
    if (!node) return
    const fit = () => setScale(node.clientWidth / STAGE)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (listing.thumbnailUrl) {
    return <div className="template-thumb"><img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" /></div>
  }
  const { snapshot } = listing
  return (
    <div ref={frame} className="template-thumb" aria-hidden="true" inert>
      {scale > 0 ? (
        <div className="template-thumb-stage" style={{ width: STAGE, transform: `scale(${scale})` }}>
          {snapshot.pageType ? (
            <TemplatePreview kind={snapshot.pageType} heading={listing.name} labels={snapshot.fieldLabels} />
          ) : (
            <TemplatePreviewProvider snapshot={snapshot}>
              <PageBuilder blocks={snapshot.blocks} editing={false} onChange={() => undefined} />
            </TemplatePreviewProvider>
          )}
        </div>
      ) : null}
    </div>
  )
}
