import { useTheme } from '../../theme/context.ts'
import { useAction } from './useThemeAction.ts'
export function ThemePreviewBar() {
    const ctx = useTheme();
    const action = useAction();
    if (!ctx.preview)
        return null;
    return <div data-theme-protected className="theme-preview-bar" role="region" aria-label="테마 미리보기"><span>테마 미리보기 중 · {ctx.preview.name}</span><button disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => ctx.apply(ctx.preview!))}>적용하기</button><button className="btn btn-line" onClick={ctx.endPreview}>미리보기 종료</button><span role="status">{action.message}</span></div>;
}
