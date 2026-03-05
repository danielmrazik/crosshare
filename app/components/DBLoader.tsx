import { useState } from 'react';
import * as WordDB from '../lib/WordDB.js';
import { useWordDB } from '../lib/WordDB.js';
import { Button } from './Buttons.js';
import { DefaultTopBar } from './TopBar.js';

export const LoadButton = (props: {
  buttonText: string;
  onClick?: () => void;
  onComplete: () => void;
}): React.JSX.Element => {
  const [dlInProgress, setDlInProgress] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const startBuild = (): void => {
    if (typeof props.onClick === 'function') {
      props.onClick();
    }

    setError('');
    setDlInProgress(true);

    const xhr = new XMLHttpRequest();
    xhr.responseType = 'json';

    xhr.onload = async (): Promise<void> => {
      setDlInProgress(false);

      const okStatus = xhr.status >= 200 && xhr.status < 300;
      const hasJson = xhr.response != null;

      if (!okStatus || !hasJson) {
        setError('Error downloading word list, please try again');
        return;
      }

      setValidating(true);
      try {
        await WordDB.validateAndSet(xhr.response);
        setValidating(false);
        props.onComplete();
      } catch {
        setValidating(false);
        setError('Downloaded word list but validation failed');
      }
    };

    xhr.onerror = (): void => {
      setDlInProgress(false);
      setError('Error downloading word list, please try again');
    };

    // Local-only: served from app/public/worddb.json
    xhr.open('GET', '/worddb.json');
    xhr.send();
  };

  if (error.length > 0) {
    return <p>Something went wrong: {error}</p>;
  }

  if (dlInProgress || validating) {
    return (
      <>
        {dlInProgress ? (
          <p>Downloading word database...</p>
        ) : (
          <p>Downloaded, validating database...</p>
        )}
        <p>
          Please be patient and keep this window open, this can take a while.
        </p>
      </>
    );
  }

  return (
    <Button
      className="fontSize1-5em"
      onClick={startBuild}
      text={props.buttonText}
    />
  );
};

export const DBLoader = (): React.JSX.Element => {
  const [ready, loadErr, loading, setLoaded] = useWordDB();

  if (loading) {
    return (
      <div>
        Checking for / validating existing database, this can take a minute...
      </div>
    );
  }

  const hasLoadError = loadErr.length > 0;

  return (
    <>
      <DefaultTopBar />
      <div className="margin1em">
        <h2>Database Rebuilder</h2>
        {hasLoadError ? <p>Error loading existing database.</p> : null}
        {ready ? (
          <p>Found an existing database.</p>
        ) : (
          <p>No existing database found.</p>
        )}
        <LoadButton
          buttonText="Build Database"
          onComplete={() => {
            setLoaded();
          }}
        />
      </div>
    </>
  );
};
