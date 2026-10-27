import { useState } from 'react'
export function useAction() {
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        setMessage('');
        try {
            await fn();
            setMessage('완료했습니다.');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : '처리하지 못했습니다.');
        }
        finally {
            setBusy(false);
        }
    };
    return { message, busy, run };
}
