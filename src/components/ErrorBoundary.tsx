import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Card } from './ui';

/*
  描画中の例外と、遅延読み込みの失敗を受け止める。

  境界が無いと画面が白いまま何も出ない。とくに起きやすいのが
  「開いたままのタブ」で、再デプロイするとチャンクのファイル名が変わるため、
  古いタブから次の画面へ移った瞬間に 404 になる。これは利用者の操作ミスでは
  ないので、原因（新しい版が出た）と直しかた（再読み込み）を出す。
*/

/** 遅延読み込みが失敗したときのブラウザ別のメッセージ */
const STALE = /dynamically imported module|Importing a module script failed|Load failed/i;

interface Props {
  children: ReactNode;
  /**
   * これが変わったらエラー表示をやめて、もう一度中身を描く。
   * key で作り直すと、エラーが無いときまで毎回作り直しになり、
   * 位置を繋いで滑らせている印（layoutId）が飛んでしまう。
   */
  resetKey: string;
}

interface State {
  error: Error | null;
  /** そのエラーを出したときの場所。ここが変われば表示をやめる */
  shownFor: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, shownFor: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  /* 場所が変わったら描き直す前に消す（更新後に setState すると二度描くことになる） */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.shownFor === props.resetKey) return null;
    return { error: null, shownFor: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 送信先は無い（このアプリは外部と通信しない）。開発中に追えるよう残す
    console.error('画面の描画に失敗しました', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = STALE.test(error.message);
    return (
      <Card className="max-w-prose-wide p-6" testId="error-boundary">
        <h1 className="text-lead font-semibold tracking-tight text-fg">
          {stale ? '新しい版が公開されています' : '画面を表示できませんでした'}
        </h1>
        <p className="mt-2 text-body leading-relaxed text-muted">
          {stale
            ? 'このタブは古い版のまま開かれています。再読み込みすると最新の版になります。進捗はブラウザに保存されているので消えません。'
            : '進捗はブラウザに保存されているので消えていません。再読み込みで直らない場合は、進捗データを書き出してから読み込み直してください。'}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-sunken p-3 font-mono text-tiny text-subtle">
          {error.message}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
          <Button onClick={() => this.setState({ error: null })}>もう一度表示してみる</Button>
        </div>
      </Card>
    );
  }
}
