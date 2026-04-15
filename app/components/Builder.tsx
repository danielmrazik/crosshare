import useEventListener from '@use-it/event-listener';
import type { User } from 'firebase/auth';
import {
  Dispatch,
  MouseEvent,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { FaUndo } from 'react-icons/fa';
import { List, type RowComponentProps, useListRef } from 'react-window';
import * as WordDB from '../lib/WordDB.js';
import {
  addAutofillFieldsToEntry,
  numMatchesForEntry,
} from '../lib/autofillGrid.js';
import * as BA from '../lib/bitArray.js';
import {
  addToBlacklist,
  getBlacklistArray,
  removeFromBlacklist,
  saveBlacklist,
} from '../lib/blacklist.js';
import { ExportProps, exportFile } from '../lib/converter.js';
import { isTextInput } from '../lib/domUtils.js';
import { entryAndCrossAtPosition, getCrosses, valAt } from '../lib/gridBase.js';
import { usePersistedBoolean } from '../lib/hooks.js';
import { fromLocalStorage } from '../lib/storage.js';
import { PRIMARY } from '../lib/style.js';
import {
  AutofillMessage,
  BLOCK,
  CancelAutofillMessage,
  Direction,
  EMPTY,
  KeyK,
  LoadDBMessage,
  ONE_WEEK,
  PartialBy,
  Position,
  PuzzleInProgressStrictT,
  PuzzleInProgressT,
  PuzzleInProgressV,
  WorkerMessage,
  fromKeyString,
  fromKeyboardEvent,
  isAutofillCompleteMessage,
  isAutofillResultMessage,
} from '../lib/types.js';
import { STORAGE_KEY, eqSet } from '../lib/utils.js';
import { ViewableEntry, entryString } from '../lib/viewableGrid.js';
import { getAutofillWorker } from '../lib/workerLoader.js';
import {
  builderReducer,
  getClueProps,
  initialBuilderState,
} from '../reducers/builderReducer.js';
import type {
  BuilderGrid,
  BuilderState,
  ClickedFillAction,
  SetShowDownloadLink,
  UseHighlightAction,
} from '../reducers/builderReducer.js';
import { KeypressAction, PuzzleAction } from '../reducers/commonActions.js';
import {
  ClickedEntryAction,
  CopyAction,
  CutAction,
  PasteAction,
} from '../reducers/gridReducer.js';
import { AuthProps } from './AuthHelpers.js';
import styles from './Builder.module.scss';
import { Button, ButtonReset } from './Buttons.js';
import { ClueMode } from './ClueMode.js';
import { ColorPicker } from './ColorPicker.js';
import { FullscreenCSS } from './FullscreenCSS.js';
import { GridView } from './Grid.js';
import { Keyboard } from './Keyboard.js';
import { NewPuzzleForm } from './NewPuzzleForm.js';
import { Overlay } from './Overlay.js';
import { SquareAndCols } from './Page.js';
import { PublishErrorsOverlay } from './PublishErrorsOverlay.js';
import { PublishOverlay } from './PublishOverlay.js';
import { Snackbar, useSnackbar } from './Snackbar.js';
import { DefaultTopBar, TopBar } from './TopBar.js';
import { MemoizedTopBarChildren } from './TopBarChildren.js';
export type BuilderProps = PartialBy<
  PuzzleInProgressStrictT,
  | 'clues'
  | 'title'
  | 'notes'
  | 'blogPost'
  | 'contestAnswers'
  | 'contestHasPrize'
  | 'contestRevealDelay'
  | 'alternates'
  | 'guestConstructor'
  | 'commentsDisabled'
  | 'isPrivate'
  | 'isPrivateUntil'
  | 'cellStyles'
  | 'vBars'
  | 'hBars'
  | 'hidden'
  | 'userTags'
>;

interface PotentialFillItemProps {
  entryIndex: number;
  value: [string, number];
  dispatch: Dispatch<ClickedFillAction>;
}
const PotentialFillItem = (props: PotentialFillItemProps) => {
  function click(e: MouseEvent) {
    e.preventDefault();
    props.dispatch({
      type: 'CLICKEDFILL',
      entryIndex: props.entryIndex,
      value: props.value[0],
    });
  }
  return (
    <ButtonReset
      className={styles.fillItem}
      onClick={click}
      text={props.value[0]}
    />
  );
};

function PotentialFillRow({
  index,
  style,
  values,
  onBanWord,
  ...props
}: RowComponentProps<{
  entryIndex: number;
  dispatch: Dispatch<ClickedFillAction>;
  values: [string, number][];
  onBanWord: (word: string) => void;
}>) {
  const value = values[index];
  if (value === undefined) {
    return null;
  }

  const word = value[0];

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <PotentialFillItem
          key={index}
          entryIndex={props.entryIndex}
          dispatch={props.dispatch}
          value={value}
        />
      </div>
      <button
        type="button"
        className={styles.subtleBanButton}
        style={{
          flex: '0 0 auto',
          padding: '2px 8px',
          fontSize: '0.8rem',
          lineHeight: 1.2,
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          const confirmed = window.confirm(
            `Ban "${word}" from suggestions and autofill?`
          );

          if (!confirmed) {
            return;
          }

          onBanWord(word);
        }}
      >
        Ban
      </button>
    </div>
  );
}

interface PotentialFillListProps {
  header: string;
  entryLength: number;
  entryIndex: number;
  selected: boolean;
  values: [string, number][];
  dispatch: Dispatch<ClickedFillAction>;
  onBanWord: (word: string) => void;
}
const PotentialFillList = (props: PotentialFillListProps) => {
  const listRef = useListRef(null);
  const listParent = useRef<HTMLDivElement>(null);

  const visibleValues = props.values;

  useEffect(() => {
    if (visibleValues.length === 0) return;
    const list = listRef.current;
    list?.scrollToRow({
      align: 'start',
      behavior: 'instant',
      index: 0,
    });
  }, [listRef, visibleValues.length]);

  return (
    <div className={styles.fillListWrapper} data-selected={props.selected}>
      <div className={styles.fillListHeader}>
        {props.header}{' '}
        <span className={styles.entryLength}>({props.entryLength})</span>
      </div>
      <div ref={listParent} className={styles.listParent}>
        <List
          rowComponent={PotentialFillRow}
          rowProps={{
            entryIndex: props.entryIndex,
            dispatch: props.dispatch,
            values: visibleValues,
            onBanWord: props.onBanWord,
          }}
          listRef={listRef}
          rowCount={visibleValues.length}
          rowHeight={35}
        />
      </div>
    </div>
  );
};

const initializeState = (props: BuilderProps & AuthProps): BuilderState => {
  const saved = fromLocalStorage(STORAGE_KEY, PuzzleInProgressV);

  return initialBuilderState({
    id: saved?.id ?? null,
    width: saved?.width ?? props.width,
    height: saved?.height ?? props.height,
    grid: saved?.grid ?? props.grid,
    vBars: saved?.vBars ?? props.vBars ?? [],
    hBars: saved?.hBars ?? props.hBars ?? [],
    hidden: saved?.hidden ?? props.hidden ?? [],
    cellStyles: saved?.cellStyles ?? props.cellStyles ?? {},
    title: saved?.title ?? props.title ?? null,
    notes: saved?.notes ?? props.notes ?? null,
    clues: saved?.clues ?? props.clues ?? {},
    authorId: props.user.uid,
    authorName: props.user.displayName || 'Anonymous',
    editable: true,
    isPrivate: saved?.isPrivate ?? false,
    isPrivateUntil: saved?.isPrivateUntil ?? null,
    blogPost: saved?.blogPost ?? null,
    guestConstructor: saved?.guestConstructor ?? null,
    commentsDisabled:
      saved?.commentsDisabled !== undefined
        ? saved.commentsDisabled
        : props.prefs?.disableCommentsByDefault,
    contestAnswers: saved?.contestAnswers ?? null,
    contestHasPrize: saved?.contestHasPrize ?? false,
    contestRevealDelay: saved?.contestRevealDelay ?? ONE_WEEK,
    alternates: saved?.alternates ?? null,
    userTags: saved?.userTags ?? [],
    symmetry: saved?.symmetry,
  });
};

const BlacklistManager = ({ onChange }: { onChange?: () => void }) => {
  const [words, setWords] = useState<string[]>(() => getBlacklistArray());
  const [newWord, setNewWord] = useState('');
  const [bulkWords, setBulkWords] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const refresh = useCallback(() => {
    setWords(getBlacklistArray());
  }, []);

  const addWord = useCallback(() => {
    const normalized = newWord.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    if (words.includes(normalized)) {
      setNewWord('');
      return;
    }
    addToBlacklist(normalized);
    setNewWord('');
    refresh();
    onChange?.();
  }, [newWord, words, refresh, onChange]);

  const addBulkWords = useCallback(() => {
    const parsed = bulkWords
      .split(/\r?\n|,|\t| /)
      .map((word) => word.trim().toUpperCase())
      .filter(Boolean);

    if (parsed.length === 0) {
      return;
    }

    const merged = new Set<string>(words);
    for (const word of parsed) {
      merged.add(word);
    }

    saveBlacklist(merged);
    setBulkWords('');
    refresh();
    onChange?.();
  }, [bulkWords, words, refresh, onChange]);

  const copyBlacklist = useCallback((): void => {
    const text = words.join('\n');

    navigator.clipboard.writeText(text).catch((err: unknown) => {
      console.error('Clipboard copy failed:', err);
    });
  }, [words]);

  const downloadBlacklist = useCallback(() => {
    const text = words.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blacklist.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [words]);

  const filteredWords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toUpperCase();
    if (!normalizedSearch) {
      return words;
    }
    return words.filter((word) => word.includes(normalizedSearch));
  }, [words, searchTerm]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={newWord}
          placeholder="Add one word"
          onChange={(e) => {
            setNewWord(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addWord();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '6px 8px',
          }}
        />
        <Button onClick={addWord} text="Add" />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <textarea
          value={bulkWords}
          placeholder="Bulk add words: paste words separated by new lines, commas, spaces, or tabs"
          onChange={(e) => {
            setBulkWords(e.target.value);
          }}
          style={{
            width: '100%',
            minHeight: '120px',
            padding: '8px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <Button onClick={addBulkWords} text="Bulk Add" />
          <Button onClick={copyBlacklist} text="Copy All" />
          <Button onClick={downloadBlacklist} text="Export .txt" />
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={searchTerm}
          placeholder="Search blacklist"
          onChange={(e) => {
            setSearchTerm(e.target.value);
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {words.length === 0 ? (
        <div>No blacklisted words.</div>
      ) : (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Total:</strong> {words.length}
            {' · '}
            <strong>Showing:</strong> {filteredWords.length}
          </div>
          {filteredWords.length === 0 ? (
            <div>No matches found.</div>
          ) : (
            filteredWords.map((word) => (
              <div
                key={word}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.25rem',
                }}
              >
                <span style={{ fontFamily: 'monospace', minWidth: '120px' }}>
                  {word}
                </span>
                <button
                  type="button"
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.8rem',
                    lineHeight: 1.2,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    removeFromBlacklist(word);
                    refresh();
                    onChange?.();
                  }}
                >
                  Unban
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const Builder = (
  props: BuilderProps & AuthProps & { isUpload?: boolean }
): React.JSX.Element => {
  const [savedInProgress] = useState<PuzzleInProgressT | null>(() =>
    fromLocalStorage(STORAGE_KEY, PuzzleInProgressV)
  );
  const [firstLaunch, setFirstLaunch] = useState(false);

  useEffect(() => {
    if (!props.isUpload && localStorage.getItem(STORAGE_KEY) === null) {
      setFirstLaunch(true);
    }
  }, [props.isUpload]);

  const [state, dispatch] = useReducer(builderReducer, props, initializeState);

  const [autofilledGrid, setAutofilledGrid] = useState<string[]>([]);
  const [autofillInProgress, setAutofillInProgress] = useState(false);
  const [reviewedPotentialRepeatKeys, setReviewedPotentialRepeatKeys] =
    useState<Set<string>>(() => {
      const reviewedPotentialRepeats: string[] =
        savedInProgress?.reviewedPotentialRepeats ?? [];
      return new Set<string>(reviewedPotentialRepeats);
    });

  const getMostConstrainedEntry: () => number | null = useCallback(() => {
    if (!WordDB.wordDB) {
      throw new Error('missing db!');
    }
    const openEntries = state.grid.entries
      .filter((e) => e.completedWord === null)
      .map((e): [ViewableEntry, number] => [
        e,
        numMatchesForEntry(
          addAutofillFieldsToEntry({
            ...e,
            pattern: e.cells.map((p) => valAt(state.grid, p)).join(''),
          })
        ),
      ])
      .sort(([_a, aMatches], [_b, bMatches]) => aMatches - bMatches);
    if (openEntries.length) {
      return openEntries[0]?.[0]?.index ?? null;
    }
    return null;
  }, [state.grid]);

  const [autofillEnabled, setAutofillEnabled] = useState(true);
  const [autofillPaused, setAutofillPaused] = useState(false);

  // We need a ref to the current grid so we can verify it in worker.onmessage
  const currentCells = useRef(state.grid.cells);
  const currentVBars = useRef(state.grid.vBars);
  const currentHBars = useRef(state.grid.hBars);
  const currentGrid = useRef(state.grid);
  const priorSolves = useRef<[string[], Set<number>, Set<number>, string][]>(
    []
  );
  const priorWidth = useRef(state.grid.width);
  const priorHeight = useRef(state.grid.height);
  const latestAutofillBlacklist = useRef('');

  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    if (!worker.current) {
      console.log('initializing autofill worker');

      if (!WordDB.wordDB) {
        throw new Error('missing db!');
      }

      worker.current = getAutofillWorker();
      worker.current.onmessage = (e) => {
        const data = e.data as WorkerMessage;
        if (isAutofillResultMessage(data)) {
          const blacklistWords = getBlacklistArray();
          if (
            hasBlacklistedEntry(
              currentGrid.current,
              data.result,
              blacklistWords
            )
          ) {
            console.warn('Ignoring autofill result with blacklisted entry');
            return;
          }
          priorSolves.current.unshift([
            data.result,
            data.input[1],
            data.input[2],
            latestAutofillBlacklist.current,
          ]);
          if (
            currentCells.current.length === data.input[0].length &&
            currentCells.current.every((c, i) => c === data.input[0][i]) &&
            eqSet(currentVBars.current, data.input[1]) &&
            eqSet(currentHBars.current, data.input[2])
          ) {
            setAutofilledGrid(Array.from(data.result));
          }
        } else if (isAutofillCompleteMessage(data)) {
          setAutofillInProgress(false);
        } else {
          console.error('unhandled msg in builder: ', e.data);
        }
      };
      const loaddb: LoadDBMessage = { type: 'loaddb', db: WordDB.wordDB };
      worker.current.postMessage(loaddb);
    }

    worker.current.onerror = (error) => {
      console.error('Autofill error:', error);
    };

    return () => {
      console.log('tearing down autofill worker');
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  const runAutofill = useCallback(() => {
    if (!worker.current) {
      throw new Error('no autofill worker!');
    }

    if (!autofillEnabled || autofillPaused) {
      const msg: CancelAutofillMessage = { type: 'cancel' };
      setAutofillInProgress(false);
      worker.current.postMessage(msg);
      return;
    }
    currentCells.current = state.grid.cells;
    currentVBars.current = state.grid.vBars;
    currentHBars.current = state.grid.hBars;
    currentGrid.current = state.grid;
    const blacklistWords = getBlacklistArray();
    const blacklistKey = blacklistWords.join('\n');
    if (
      priorWidth.current !== state.grid.width ||
      priorHeight.current !== state.grid.height
    ) {
      priorWidth.current = state.grid.width;
      priorHeight.current = state.grid.height;
      priorSolves.current = [];
    }
    for (const [
      priorSolve,
      vBars,
      hBars,
      priorBlacklistKey,
    ] of priorSolves.current) {
      let match = true;
      if (priorBlacklistKey !== blacklistKey) {
        match = false;
      }
      for (const [i, cell] of state.grid.cells.entries()) {
        if (priorSolve[i] === '.' && cell !== '.') {
          match = false;
          break;
        }
        if (cell.trim() && priorSolve[i] !== cell) {
          match = false;
          break;
        }
      }
      if (!eqSet(vBars, state.grid.vBars)) {
        match = false;
      }
      if (!eqSet(hBars, state.grid.hBars)) {
        match = false;
      }
      if (
        match &&
        hasBlacklistedEntry(state.grid, priorSolve, blacklistWords)
      ) {
        match = false;
      }
      if (match) {
        const msg: CancelAutofillMessage = { type: 'cancel' };
        setAutofillInProgress(false);
        worker.current.postMessage(msg);
        setAutofilledGrid(priorSolve);
        return;
      }
    }
    setAutofilledGrid([]);
    latestAutofillBlacklist.current = blacklistKey;
    const autofill: AutofillMessage = {
      type: 'autofill',
      grid: state.grid.cells,
      blacklist: blacklistWords,
      width: state.grid.width,
      height: state.grid.height,
      vBars: state.grid.vBars,
      hBars: state.grid.hBars,
    };
    setAutofillInProgress(true);
    worker.current.postMessage(autofill);
  }, [
    state.grid,
    autofillEnabled,
    autofillPaused,
    setAutofilledGrid,
    setAutofillInProgress,
  ]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      runAutofill();
    }, 120);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [runAutofill]);

  useEffect(() => {
    const inProgress: PuzzleInProgressT = {
      id: state.id,
      width: state.grid.width,
      height: state.grid.height,
      grid: state.grid.cells,
      vBars: Array.from(state.grid.vBars),
      hBars: Array.from(state.grid.hBars),
      hidden: Array.from(state.grid.hidden),
      cellStyles: Object.fromEntries(
        Array.from(state.grid.cellStyles.entries()).map(([k, v]) => [
          k,
          Array.from(v),
        ])
      ),
      clues: state.clues,
      title: state.title,
      notes: state.notes,
      blogPost: state.blogPost,
      guestConstructor: state.guestConstructor,
      commentsDisabled: state.commentsDisabled,
      isPrivate: state.isPrivate,
      isPrivateUntil: state.isPrivateUntil?.toMillis(),
      alternates: state.alternates,
      userTags: state.userTags,
      symmetry: state.symmetry,
      contestAnswers: state.isContestPuzzle
        ? (state.contestAnswers ?? undefined)
        : undefined,
      contestHasPrize: state.isContestPuzzle
        ? state.contestHasPrize
        : undefined,
      reviewedPotentialRepeats: Array.from(reviewedPotentialRepeatKeys),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inProgress));
  }, [
    state.id,
    state.clues,
    state.grid.cells,
    state.grid.width,
    state.grid.height,
    state.grid.cellStyles,
    state.grid.hidden,
    state.title,
    state.notes,
    state.blogPost,
    state.guestConstructor,
    state.commentsDisabled,
    state.isPrivate,
    state.isPrivateUntil,
    state.alternates,
    state.grid.vBars,
    state.grid.hBars,
    state.userTags,
    state.symmetry,
    state.isContestPuzzle,
    state.contestAnswers,
    state.contestHasPrize,
    reviewedPotentialRepeatKeys,
  ]);

  const reRunAutofill = useCallback(() => {
    priorSolves.current = [];
    runAutofill();
  }, [runAutofill]);

  const [clueMode, setClueMode] = useState(false);

  if (firstLaunch) {
    return (
      <>
        <DefaultTopBar />
        <div className={styles.newPuzzleWrapper}>
          <NewPuzzleForm
            dispatch={dispatch}
            onCreate={() => {
              setFirstLaunch(false);
            }}
            hideWarning
          />
        </div>
      </>
    );
  }
  if (clueMode) {
    return (
      <ClueMode
        user={props.user}
        state={state}
        puzzleId={state.id}
        authorId={state.authorId}
        dispatch={dispatch}
        blogPost={state.blogPost}
        guestConstructor={state.guestConstructor}
        title={state.title}
        notes={state.notes}
        clues={state.clues}
        completedEntries={state.grid.entries.filter((e) => e.completedWord)}
        exitClueMode={() => {
          setClueMode(false);
        }}
      />
    );
  }

  return (
    <GridMode
      getMostConstrainedEntry={getMostConstrainedEntry}
      reRunAutofill={reRunAutofill}
      user={props.user}
      isAdmin={props.isAdmin}
      autofillEnabled={autofillEnabled}
      autofillPaused={autofillPaused}
      setAutofillEnabled={setAutofillEnabled}
      setAutofillPaused={setAutofillPaused}
      autofilledGrid={autofilledGrid}
      autofillInProgress={autofillInProgress}
      state={state}
      dispatch={dispatch}
      setClueMode={setClueMode}
      reviewedPotentialRepeatKeys={reviewedPotentialRepeatKeys}
      setReviewedPotentialRepeatKeys={setReviewedPotentialRepeatKeys}
    />
  );
};

/* Returns the index within a word string of the start of the `active` cell,
 * if that word were used as fill for `entry`. */
const activeIndex = (
  grid: BuilderGrid,
  active: Position,
  entry: ViewableEntry
): number => {
  let j = -1;
  for (const cell of entry.cells) {
    j += 1;
    if (active.row === cell.row && active.col === cell.col) {
      return j;
    }
    // add extra for rebus:
    j = j + valAt(grid, cell).length - 1;
  }
  console.error('active not in entry', active, entry);
  throw new Error('active not in entry');
};

const lettersAtIndex = (fill: [string, number][], index: number): string => {
  let seen = '';
  for (const [word] of fill) {
    const char = word[index];
    if (char === undefined) {
      continue;
    }
    if (!seen.includes(char)) {
      seen += char;
    }
  }
  return seen;
};

const hasBlacklistedEntry = (
  grid: BuilderGrid,
  cells: string[],
  blacklistWords: string[]
): boolean => {
  const blacklist = new Set(blacklistWords);

  for (const entry of grid.entries) {
    let word = '';

    for (const cell of entry.cells) {
      const value = cells[cell.row * grid.width + cell.col]
        ?.trim()
        .toUpperCase();

      if (!value || value === '.') {
        word = '';
        break;
      }

      word += value;
    }

    if (word && blacklist.has(word)) {
      return true;
    }
  }

  return false;
};

const potentialFill = (
  entry: ViewableEntry,
  grid: BuilderGrid,
  blacklist: Set<string>
): [string, number][] => {
  if (entry.completedWord) {
    const word = entry.completedWord.trim().toUpperCase();
    if (blacklist.has(word)) {
      return [];
    }
  }

  let pattern = '';
  const crosses = getCrosses(grid, entry);

  for (const [index, cell] of entry.cells.entries()) {
    const val = valAt(grid, cell);
    const cross = crosses[index];
    if (!cross) throw new Error('bad cross');

    if (
      entry.completedWord &&
      val.length === 1 &&
      cross.entryIndex !== null &&
      !grid.entries[cross.entryIndex]?.completedWord
    ) {
      pattern += ' ';
    } else {
      pattern += val;
    }
  }

  const successLetters = new Array<string>(entry.cells.length).fill('');
  const failLetters = new Array<string>(entry.cells.length).fill('');

  const matches = WordDB.matchingWords(
    pattern.length,
    WordDB.matchingBitmap(pattern)
  );

  const filtered = matches.filter(([word]) => {
    const normalized = word.trim().toUpperCase();

    if (blacklist.has(normalized)) {
      return false;
    }

    let j = -1;

    for (const [i, cellPos] of entry.cells.entries()) {
      j += 1;

      const cell = valAt(grid, cellPos);

      if (cell.length > 1) {
        j += cell.length - 1;
        continue;
      }

      if (!entry.completedWord && cell !== ' ') {
        continue;
      }

      const letter = word[j];
      if (letter === undefined) {
        throw new Error('out of bounds on ' + word);
      }

      if (successLetters[i]?.includes(letter)) continue;
      if (failLetters[i]?.includes(letter)) return false;

      const crossObj = crosses[i];
      if (!crossObj) throw new Error('bad crosses');

      const crossIndex = crossObj.entryIndex;

      if (crossIndex === null) {
        successLetters[i] += letter;
        continue;
      }

      const cross = grid.entries[crossIndex];
      if (!cross) throw new Error('bad cross index');

      if (cross.completedWord) {
        successLetters[i] += letter;
        continue;
      }

      let crossPattern = '';

      for (const crossCell of cross.cells) {
        if (crossCell.row === cellPos.row && crossCell.col === cellPos.col) {
          crossPattern += letter;
        } else {
          crossPattern += valAt(grid, crossCell);
        }
      }

      const newBitmap = WordDB.matchingBitmap(crossPattern);

      if (!newBitmap || BA.isZero(newBitmap)) {
        failLetters[i] += letter;
        return false;
      } else {
        successLetters[i] += letter;
      }
    }

    return true;
  });

  return filtered.filter(([word]) => {
    return !blacklist.has(word.trim().toUpperCase());
  });
};

interface PotentialRepeatOccurrence {
  entryIndex: number;
  entryLabel: string;
  entryFill: string;
  startIndex: number;
  endIndex: number;
}

interface PotentialRepeat {
  word: string;
  occurrences: PotentialRepeatOccurrence[];
}

const potentialRepeatKey = (repeat: PotentialRepeat): string => {
  return JSON.stringify({
    word: repeat.word,
    occurrences: repeat.occurrences
      .map((occurrence) => ({
        entryIndex: occurrence.entryIndex,
        startIndex: occurrence.startIndex,
        endIndex: occurrence.endIndex,
      }))
      .sort((a, b) => {
        return (
          a.entryIndex - b.entryIndex ||
          a.startIndex - b.startIndex ||
          a.endIndex - b.endIndex
        );
      }),
  });
};

const typedLetterAtIndex = (cells: string[], index: number): string | null => {
  const value = cells[index]?.trim().toUpperCase();
  if (!value || !/^[A-Z]$/.test(value)) {
    return null;
  }
  return value;
};

const getPotentialRepeats = (grid: BuilderGrid): PotentialRepeat[] => {
  const occurrencesByWord = new Map<string, PotentialRepeatOccurrence[]>();
  const wordSetsByLength = new Map<number, Set<string>>();

  const hasWord = (word: string): boolean => {
    let wordsForLength = wordSetsByLength.get(word.length);
    if (!wordsForLength) {
      wordsForLength = new Set<string>(
        (WordDB.wordDB?.words[word.length] ?? []).map(
          ([candidate]) => candidate
        )
      );
      wordSetsByLength.set(word.length, wordsForLength);
    }
    return wordsForLength.has(word);
  };

  for (const entry of grid.entries) {
    const letters = entry.cells.map((cell) =>
      typedLetterAtIndex(grid.cells, cell.row * grid.width + cell.col)
    );

    let runStart = 0;
    while (runStart < letters.length) {
      while (runStart < letters.length && letters[runStart] === null) {
        runStart += 1;
      }
      if (runStart >= letters.length) {
        break;
      }

      let runEnd = runStart;
      while (runEnd < letters.length && letters[runEnd] !== null) {
        runEnd += 1;
      }

      if (runEnd - runStart >= 3) {
        for (let start = runStart; start <= runEnd - 3; start += 1) {
          let word = '';
          for (let end = start; end < runEnd; end += 1) {
            const letter = letters[end];
            if (letter === null) {
              break;
            }
            word += letter;
            if (word.length < 3 || !hasWord(word)) {
              continue;
            }

            const occurrences = occurrencesByWord.get(word) ?? [];
            occurrences.push({
              entryIndex: entry.index,
              entryLabel: entryString(entry),
              entryFill: letters
                .map((letter) => {
                  return letter ?? ' ';
                })
                .join(''),
              startIndex: start,
              endIndex: end,
            });
            occurrencesByWord.set(word, occurrences);
          }
        }
      }

      runStart = runEnd + 1;
    }
  }

  const repeated = Array.from(occurrencesByWord.entries())
    .filter(([_word, occurrences]) => {
      return (
        new Set(occurrences.map((occurrence) => occurrence.entryIndex)).size > 1
      );
    })
    .map(([word, occurrences]) => ({
      word,
      occurrences: occurrences.sort((a, b) => {
        return (
          a.entryLabel.localeCompare(b.entryLabel, undefined, {
            numeric: true,
          }) || a.startIndex - b.startIndex
        );
      }),
    }))
    .sort(
      (a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word)
    );

  return repeated.filter((candidate) => {
    return !candidate.occurrences.every((occurrence) =>
      repeated.some((other) => {
        if (other.word.length <= candidate.word.length) {
          return false;
        }
        return other.occurrences.some(
          (otherOccurrence) =>
            otherOccurrence.entryIndex === occurrence.entryIndex &&
            otherOccurrence.startIndex <= occurrence.startIndex &&
            otherOccurrence.endIndex >= occurrence.endIndex
        );
      })
    );
  });
};

const PuzDownloadLink = (props: ExportProps) => {
  const [dataURI, setDataURI] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const data = exportFile(props);
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      function () {
        if (typeof reader.result === 'string') {
          setDataURI(reader.result);
        } else {
          setError('Bad result, please try again');
        }
      },
      false
    );
    reader.readAsDataURL(new Blob([data as BlobPart]));
  }, [props]);
  if (error) {
    return <>{error}</>;
  }
  if (!dataURI) {
    return <>Generating file...</>;
  }
  return (
    <a href={dataURI} download={props.t + '.puz'}>
      Download
    </a>
  );
};

const upcomingSundayString = (): string => {
  const date = new Date();
  const daysUntilSunday = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysUntilSunday);

  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}${month}${day}`;
};

const PuzDownloadOverlay = (props: {
  state: BuilderState;
  cancel: () => void;
}) => {
  if (props.state.grid.vBars.size || props.state.grid.hBars.size) {
    return (
      <Overlay closeCallback={props.cancel}>
        <h2>Export unsupported</h2>
        <p>
          Barred grids currently cannot be exported (.puz does not support
          bars).
        </p>
      </Overlay>
    );
  }
  return (
    <Overlay closeCallback={props.cancel}>
      <h2>Exporting .puz</h2>
      <p>
        <PuzDownloadLink
          w={props.state.grid.width}
          h={props.state.grid.height}
          g={props.state.grid.cells}
          // Restore branded export metadata later if needed:
          // n="Crosswoods"
          // t="yyyy.mm.dd"
          // cn={`Crosswoods
          //   heycrosswoods@gmail.com
          //   https://heycrosswoods.com`}
          n=""
          t={upcomingSundayString()}
          {...getClueProps(
            props.state.grid.sortedEntries,
            props.state.grid.entries,
            props.state.clues,
            false
          )}
        />
      </p>
    </Overlay>
  );
};

interface GridModeProps {
  user: User;
  isAdmin: boolean;
  reRunAutofill: () => void;
  autofillEnabled: boolean;
  autofillPaused: boolean;
  setAutofillEnabled: (val: boolean) => void;
  setAutofillPaused: (val: boolean) => void;
  autofilledGrid: string[];
  autofillInProgress: boolean;
  state: BuilderState;
  dispatch: Dispatch<PuzzleAction>;
  setClueMode: (val: boolean) => void;
  getMostConstrainedEntry: () => number | null;
  reviewedPotentialRepeatKeys: Set<string>;
  setReviewedPotentialRepeatKeys: Dispatch<SetStateAction<Set<string>>>;
}
const GridMode = ({
  getMostConstrainedEntry,
  reRunAutofill,
  state,
  dispatch,
  setClueMode,
  reviewedPotentialRepeatKeys,
  setReviewedPotentialRepeatKeys,
  ...props
}: GridModeProps) => {
  const { autofillPaused, setAutofillPaused } = props;
  const [muted, setMuted] = usePersistedBoolean('muted', true);
  const [toggleKeyboard, setToggleKeyboard] = usePersistedBoolean(
    'keyboard',
    false
  );
  const [pickingHighlightColor, setPickingHighlightColor] = useState(false);
  const [showBlacklistManager, setShowBlacklistManager] = useState(false);
  const [showPotentialRepeats, setShowPotentialRepeats] = useState(false);
  const [showPuzzleStats, setShowPuzzleStats] = useState(false);
  const [wordCountSort, setWordCountSort] = useState<'length' | 'count'>(
    'length'
  );
  const [highlightColor, setHighlightColor] = useState(PRIMARY);
  const { showSnackbar } = useSnackbar();
  const [manualBanWord, setManualBanWord] = useState('');
  const [blacklistWords, setBlacklistWords] = useState<string[]>(() =>
    getBlacklistArray()
  );

  const refreshBlacklistConsumers = useCallback(() => {
    setBlacklistWords(getBlacklistArray());
    reRunAutofill();
  }, [reRunAutofill]);

  const banWord = useCallback(
    (word: string) => {
      addToBlacklist(word.trim().toUpperCase());
      refreshBlacklistConsumers();
    },
    [refreshBlacklistConsumers]
  );

  const submitManualBan = () => {
    const word = manualBanWord.replace(/\s+/g, '').toUpperCase();

    if (!word) return;

    banWord(word);
    setManualBanWord('');
  };

  const usedHighlightColors = useMemo(() => {
    return Array.from(state.grid.cellStyles.keys()).filter(
      (c) => !['circle', 'shade'].includes(c)
    );
  }, [state.grid.cellStyles]);

  const physicalKeyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      const mkey = fromKeyboardEvent(e);
      if (mkey !== null) {
        e.preventDefault();
        if (mkey.k === KeyK.Enter && !state.isEnteringRebus) {
          reRunAutofill();
          return;
        }
        if (mkey.k === KeyK.AutofillPause) {
          const nextPaused = !autofillPaused;
          setAutofillPaused(nextPaused);
          if (nextPaused) {
            showSnackbar('Autofill Paused');
          } else {
            reRunAutofill();
          }
          return;
        }
        if (mkey.k === KeyK.Exclamation) {
          const entry = getMostConstrainedEntry();
          if (entry !== null) {
            const ca: ClickedEntryAction = {
              type: 'CLICKEDENTRY',
              entryIndex: entry,
            };
            dispatch(ca);
          }
          return;
        }
        if (mkey.k === KeyK.Undo) {
          dispatch({ type: 'UNDO' });
          return;
        }
        if (mkey.k === KeyK.Redo) {
          dispatch({ type: 'REDO' });
          return;
        }
        const kpa: KeypressAction = { type: 'KEYPRESS', key: mkey };
        dispatch(kpa);
      }
    },
    [
      dispatch,
      reRunAutofill,
      state.isEnteringRebus,
      getMostConstrainedEntry,
      autofillPaused,
      setAutofillPaused,
      showSnackbar,
    ]
  );
  useEventListener('keydown', physicalKeyboardHandler);

  const copyHandler = useCallback(
    (e: ClipboardEvent) => {
      if (isTextInput(e.target)) {
        return;
      }
      dispatch({ type: 'COPY' } as CopyAction);
      e.preventDefault();
    },
    [dispatch]
  );
  useEventListener('copy', copyHandler);

  const cutHandler = useCallback(
    (e: ClipboardEvent) => {
      if (isTextInput(e.target)) {
        return;
      }
      dispatch({ type: 'CUT' } as CutAction);
      e.preventDefault();
    },
    [dispatch]
  );
  useEventListener('cut', cutHandler);

  const pasteHandler = useCallback(
    (e: ClipboardEvent) => {
      if (isTextInput(e.target)) {
        return;
      }
      const pa: PasteAction = {
        type: 'PASTE',
        content: e.clipboardData?.getData('Text') ?? '',
      };
      dispatch(pa);
      e.preventDefault();
    },
    [dispatch]
  );
  useEventListener('paste', pasteHandler);

  const fillLists = useMemo(() => {
    const blacklist = new Set(blacklistWords);
    let left = <></>;
    let right = <></>;
    const [entry, cross] = entryAndCrossAtPosition(state.grid, state.active);
    let crossMatches =
      cross && potentialFill(cross, state.grid, blacklist).slice(0, 1000);
    let entryMatches =
      entry && potentialFill(entry, state.grid, blacklist).slice(0, 1000);

    if (
      crossMatches !== null &&
      entryMatches !== null &&
      entry !== null &&
      cross !== null
    ) {
      /* If we have both entry + cross we now filter for only matches that'd work for both. */
      const entryActiveIndex = activeIndex(state.grid, state.active, entry);
      const crossActiveIndex = activeIndex(state.grid, state.active, cross);
      const entryValidLetters = lettersAtIndex(entryMatches, entryActiveIndex);
      const crossValidLetters = lettersAtIndex(crossMatches, crossActiveIndex);
      const validLetters = (
        entryValidLetters.match(
          new RegExp('[' + crossValidLetters + ']', 'g')
        ) ?? []
      ).join('');
      entryMatches = entryMatches.filter(([word]) => {
        const l = word[entryActiveIndex];
        return l ? validLetters.includes(l) : false;
      });
      crossMatches = crossMatches.filter(([word]) => {
        const l = word[crossActiveIndex];
        return l ? validLetters.includes(l) : false;
      });
    }

    if (cross && crossMatches !== null) {
      if (cross.direction === Direction.Across) {
        left = (
          <PotentialFillList
            selected={false}
            header="Across"
            values={crossMatches}
            entryLength={cross.cells.length}
            entryIndex={cross.index}
            dispatch={dispatch}
            onBanWord={banWord}
          />
        );
      } else {
        right = (
          <PotentialFillList
            selected={false}
            header="Down"
            values={crossMatches}
            entryLength={cross.cells.length}
            entryIndex={cross.index}
            dispatch={dispatch}
            onBanWord={banWord}
          />
        );
      }
    }
    if (entry && entryMatches !== null) {
      if (entry.direction === Direction.Across) {
        left = (
          <PotentialFillList
            selected={true}
            header="Across"
            values={entryMatches}
            entryLength={entry.cells.length}
            entryIndex={entry.index}
            dispatch={dispatch}
            onBanWord={banWord}
          />
        );
      } else {
        right = (
          <PotentialFillList
            selected={true}
            header="Down"
            values={entryMatches}
            entryLength={entry.cells.length}
            entryIndex={entry.index}
            dispatch={dispatch}
            onBanWord={banWord}
          />
        );
      }
    }
    return { left, right };
  }, [state.grid, state.active, dispatch, banWord, blacklistWords]);

  const potentialRepeats = useMemo(
    () => getPotentialRepeats(state.grid),
    [state.grid]
  );
  const potentialRepeatKeys = useMemo(
    () => new Set(potentialRepeats.map((repeat) => potentialRepeatKey(repeat))),
    [potentialRepeats]
  );

  useEffect(() => {
    setReviewedPotentialRepeatKeys((previous) => {
      const next = new Set(
        Array.from(previous).filter((key) => potentialRepeatKeys.has(key))
      );
      if (next.size === previous.size) {
        let unchanged = true;
        for (const key of next) {
          if (!previous.has(key)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) {
          return previous;
        }
      }
      return next;
    });
  }, [potentialRepeatKeys, setReviewedPotentialRepeatKeys]);

  const [reviewedPotentialRepeats, unreviewedPotentialRepeats] = useMemo(() => {
    const reviewed: PotentialRepeat[] = [];
    const unreviewed: PotentialRepeat[] = [];

    potentialRepeats.forEach((repeat) => {
      if (reviewedPotentialRepeatKeys.has(potentialRepeatKey(repeat))) {
        reviewed.push(repeat);
      } else {
        unreviewed.push(repeat);
      }
    });

    return [reviewed, unreviewed];
  }, [potentialRepeats, reviewedPotentialRepeatKeys]);

  const { autofillEnabled, setAutofillEnabled } = props;
  const toggleAutofillEnabled = useCallback(() => {
    if (autofillEnabled) {
      showSnackbar('Autofill Disabled');
      setAutofillPaused(false);
    }
    setAutofillEnabled(!autofillEnabled);
  }, [autofillEnabled, setAutofillEnabled, setAutofillPaused, showSnackbar]);

  const toggleAutofillPaused = useCallback(() => {
    const nextPaused = !autofillPaused;
    setAutofillPaused(nextPaused);
    if (nextPaused) {
      showSnackbar('Autofill Paused');
    } else {
      reRunAutofill();
    }
  }, [autofillPaused, reRunAutofill, setAutofillPaused, showSnackbar]);

  const stats = useMemo(() => {
    let totalLength = 0;
    const lengthHistogram: number[] = new Array<number>(
      Math.max(state.grid.width, state.grid.height) - 1
    ).fill(0);
    const lengthHistogramNames = lengthHistogram.map((_, i) =>
      (i + 2).toString()
    );

    state.grid.entries.forEach((e) => {
      totalLength += e.cells.length;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lengthHistogram[e.cells.length - 2]! += 1;
    });
    const numEntries = state.grid.entries.length;
    const averageLength = totalLength / numEntries;
    const lettersHistogram: number[] = new Array<number>(26).fill(0);
    const lettersHistogramNames = lettersHistogram.map((_, i) =>
      String.fromCharCode(i + 65)
    );
    let numBlocks = 0;
    const numTotal = state.grid.width * state.grid.height;
    state.grid.cells.forEach((s) => {
      if (s === '.') {
        numBlocks += 1;
      } else {
        const index = lettersHistogramNames.indexOf(s);
        if (index !== -1) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          lettersHistogram[index]! += 1;
        }
      }
    });
    return {
      numBlocks,
      numTotal,
      lengthHistogram,
      lengthHistogramNames,
      numEntries,
      averageLength,
      lettersHistogram,
      lettersHistogramNames,
    };
  }, [
    state.grid.entries,
    state.grid.height,
    state.grid.width,
    state.grid.cells,
  ]);

  const puzzleStats = useMemo(() => {
    let across = 0;
    let down = 0;

    state.grid.entries.forEach((entry) => {
      if (entry.direction === Direction.Across) {
        across += 1;
      } else {
        down += 1;
      }
    });

    const maxWordLength = Math.max(state.grid.width, state.grid.height);
    const wordCountsByLength = Array.from(
      { length: maxWordLength },
      (_, i) => ({
        length: i + 1,
        count: state.grid.entries.filter(
          (entry) => entry.cells.length === i + 1
        ).length,
      })
    );

    return {
      across,
      down,
      totalWords: across + down,
      blackSquarePercent:
        stats.numTotal === 0 ? 0 : (100 * stats.numBlocks) / stats.numTotal,
      averageWordLength: Number.isFinite(stats.averageLength)
        ? stats.averageLength
        : 0,
      wordCountsByLength: wordCountsByLength.filter(({ count }) => count > 0),
    };
  }, [
    state.grid.entries,
    state.grid.width,
    state.grid.height,
    stats.averageLength,
    stats.numBlocks,
    stats.numTotal,
  ]);

  const sortedWordCounts = useMemo(() => {
    const wordCounts = [...puzzleStats.wordCountsByLength];
    if (wordCountSort === 'count') {
      wordCounts.sort((a, b) => b.count - a.count || a.length - b.length);
      return wordCounts;
    }
    wordCounts.sort((a, b) => a.length - b.length);
    return wordCounts;
  }, [puzzleStats.wordCountsByLength, wordCountSort]);

  const shortWordCells = useMemo(() => {
    const cells = new Set<number>();

    const markShortRuns = (direction: Direction) => {
      const isAcross = direction === Direction.Across;
      const outerLimit = isAcross ? state.grid.height : state.grid.width;
      const innerLimit = isAcross ? state.grid.width : state.grid.height;
      const bars = isAcross ? state.grid.vBars : state.grid.hBars;

      for (let outer = 0; outer < outerLimit; outer += 1) {
        let run: number[] = [];

        for (let inner = 0; inner < innerLimit; inner += 1) {
          const row = isAcross ? outer : inner;
          const col = isAcross ? inner : outer;
          const index = row * state.grid.width + col;
          const value = state.grid.cells[index];

          if (value === BLOCK) {
            if (run.length > 0 && run.length < 3) {
              run.forEach((cell) => cells.add(cell));
            }
            run = [];
            continue;
          }

          run.push(index);

          const hasBarAfterCell =
            inner < innerLimit - 1 && bars.has(index);

          if (hasBarAfterCell) {
            if (run.length < 3) {
              run.forEach((cell) => cells.add(cell));
            }
            run = [];
          }
        }

        if (run.length > 0 && run.length < 3) {
          run.forEach((cell) => cells.add(cell));
        }
      }
    };

    markShortRuns(Direction.Across);
    markShortRuns(Direction.Down);

    return cells;
  }, [
    state.grid.cells,
    state.grid.width,
    state.grid.height,
    state.grid.vBars,
    state.grid.hBars,
  ]);

  const canRotateUnfilledGrid = useMemo(() => {
    return state.grid.cells.every((cell) => cell === EMPTY || cell === BLOCK);
  }, [state.grid.cells]);

  const puzzleStatsTooltip = useMemo(
    () =>
      [
        `Total Words: ${puzzleStats.totalWords}`,
        `Size: ${state.grid.width} x ${state.grid.height}`,
        `Black Squares: ${stats.numBlocks} (${puzzleStats.blackSquarePercent.toFixed(2)}%)`,
        `Avg. Word Length: ${puzzleStats.averageWordLength.toFixed(2)}`,
        `Word Counts: ${sortedWordCounts
          .map(({ length, count }) => `${length}:${count}`)
          .join(', ')}`,
      ].join('\n'),
    [
      puzzleStats.totalWords,
      puzzleStats.blackSquarePercent,
      puzzleStats.averageWordLength,
      sortedWordCounts,
      state.grid.width,
      state.grid.height,
      stats.numBlocks,
    ]
  );

  const keyboardHandler = useCallback(
    (key: string) => {
      const mkey = fromKeyString(key);
      if (mkey !== null) {
        const kpa: KeypressAction = { type: 'KEYPRESS', key: mkey };
        dispatch(kpa);
      }
    },
    [dispatch]
  );

  const builderStateForTopBar = useMemo(
    () => ({
      symmetry: state.symmetry,
      gridIsComplete: state.gridIsComplete,
      hasNoShortWords: state.hasNoShortWords,
      repeats: state.repeats,
      gridWidth: state.grid.width,
      gridHeight: state.grid.height,
    }),
    [
      state.symmetry,
      state.gridIsComplete,
      state.hasNoShortWords,
      state.repeats,
      state.grid.width,
      state.grid.height,
    ]
  );

  return (
    <>
      <FullscreenCSS />
      {state.alternates.length > 0 ? (
        <Snackbar
          message="The grid can't be edited if any alternate solutions are specified"
          isOpen
        />
      ) : (
        ''
      )}
      <div className={styles.page}>
        <div className="flexNone">
          <TopBar>
            <MemoizedTopBarChildren
              autofillEnabled={autofillEnabled}
              autofillPaused={autofillPaused}
              autofillInProgress={props.autofillInProgress}
              autofilledGridLength={props.autofilledGrid.length}
              isAdmin={props.isAdmin}
              toggleAutofillEnabled={toggleAutofillEnabled}
              toggleAutofillPaused={toggleAutofillPaused}
              getMostConstrainedEntry={getMostConstrainedEntry}
              dispatch={dispatch}
              reRunAutofill={reRunAutofill}
              setClueMode={setClueMode}
              builderState={builderStateForTopBar}
              stats={stats}
              usedHighlightColors={usedHighlightColors}
              setPickingHighlightColor={setPickingHighlightColor}
              muted={muted}
              setMuted={setMuted}
              toggleKeyboard={toggleKeyboard}
              setToggleKeyboard={setToggleKeyboard}
              openBlacklistManager={() => {
                setShowBlacklistManager(true);
              }}
              potentialRepeatsCount={unreviewedPotentialRepeats.length}
              openPotentialRepeats={() => {
                setShowPotentialRepeats(true);
              }}
            />
          </TopBar>
        </div>
        {pickingHighlightColor ? (
          <Overlay
            closeCallback={() => {
              setPickingHighlightColor(false);
            }}
          >
            <ColorPicker
              initial={highlightColor}
              swatchBase={PRIMARY}
              onChange={(c) => {
                setHighlightColor(c);
              }}
              hideCustom={true}
            />
            <Button
              className="marginTop1em"
              onClick={() => {
                const a: UseHighlightAction = {
                  type: 'USEHIGHLIGHT',
                  highlight: highlightColor,
                };
                dispatch(a);
                setPickingHighlightColor(false);
              }}
              text={'Set Highlight'}
            />
          </Overlay>
        ) : (
          ''
        )}
        {showBlacklistManager ? (
          <Overlay
            closeCallback={() => {
              setShowBlacklistManager(false);
            }}
          >
            <h2>Blacklisted Words</h2>
            <BlacklistManager onChange={refreshBlacklistConsumers} />
          </Overlay>
        ) : (
          ''
        )}
        {showPotentialRepeats ? (
          <Overlay
            closeCallback={() => {
              setShowPotentialRepeats(false);
            }}
          >
            <h2>Potential Repeated Fill</h2>
            {potentialRepeats.length === 0 ? (
              <p>
                No repeated 3+ letter wordlist strings found in typed grid fill.
              </p>
            ) : (
              <>
                <p>
                  Reviewing typed letters only. Suggestions and unaccepted
                  autofill are ignored.
                </p>
                <div className={styles.potentialRepeatsSection}>
                  <h3 className={styles.potentialRepeatsSectionHeader}>
                    Needs Review
                  </h3>
                  {unreviewedPotentialRepeats.length === 0 ? (
                    <p className={styles.potentialRepeatsEmpty}>
                      No unreviewed potential repeats.
                    </p>
                  ) : (
                    <div className={styles.potentialRepeatsList}>
                      {unreviewedPotentialRepeats.map((repeat) => (
                        <div
                          key={repeat.word}
                          className={styles.potentialRepeatCard}
                        >
                          <div className={styles.potentialRepeatHeader}>
                            <strong>{repeat.word}</strong>
                            <span>
                              {repeat.occurrences.length}{' '}
                              {repeat.occurrences.length === 1
                                ? 'match'
                                : 'matches'}
                            </span>
                          </div>
                          <div className={styles.potentialRepeatOccurrences}>
                            {Array.from(
                              new Map(
                                repeat.occurrences.map((occurrence) => [
                                  occurrence.entryIndex,
                                  occurrence,
                                ])
                              ).values()
                            ).map((occurrence) => (
                              <button
                                key={`${repeat.word}-${occurrence.entryIndex}`}
                                type="button"
                                className={styles.potentialRepeatButton}
                                onClick={() => {
                                  const action: ClickedEntryAction = {
                                    type: 'CLICKEDENTRY',
                                    entryIndex: occurrence.entryIndex,
                                  };
                                  setShowPotentialRepeats(false);
                                  dispatch(action);
                                }}
                              >
                                <span
                                  className={styles.potentialRepeatEntryLabel}
                                >
                                  {occurrence.entryLabel}
                                </span>
                                <span
                                  className={styles.potentialRepeatEntryFill}
                                >
                                  <span>
                                    {occurrence.entryFill.slice(
                                      0,
                                      occurrence.startIndex
                                    )}
                                  </span>
                                  <span className={styles.potentialRepeatMatch}>
                                    {occurrence.entryFill.slice(
                                      occurrence.startIndex,
                                      occurrence.endIndex + 1
                                    )}
                                  </span>
                                  <span>
                                    {occurrence.entryFill.slice(
                                      occurrence.endIndex + 1
                                    )}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className={styles.potentialRepeatActions}>
                            <button
                              type="button"
                              className={styles.potentialRepeatReviewButton}
                              onClick={() => {
                                setReviewedPotentialRepeatKeys((previous) => {
                                  const next = new Set(previous);
                                  next.add(potentialRepeatKey(repeat));
                                  return next;
                                });
                              }}
                            >
                              Reviewed
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.potentialRepeatsSection}>
                  <h3 className={styles.potentialRepeatsSectionHeader}>
                    Reviewed
                  </h3>
                  {reviewedPotentialRepeats.length === 0 ? (
                    <p className={styles.potentialRepeatsEmpty}>
                      No reviewed potential repeats yet.
                    </p>
                  ) : (
                    <div className={styles.potentialRepeatsList}>
                      {reviewedPotentialRepeats.map((repeat) => (
                        <div
                          key={repeat.word}
                          className={styles.potentialRepeatCard}
                        >
                          <div className={styles.potentialRepeatHeader}>
                            <strong>{repeat.word}</strong>
                            <span>
                              {repeat.occurrences.length}{' '}
                              {repeat.occurrences.length === 1
                                ? 'match'
                                : 'matches'}
                            </span>
                          </div>
                          <div className={styles.potentialRepeatOccurrences}>
                            {Array.from(
                              new Map(
                                repeat.occurrences.map((occurrence) => [
                                  occurrence.entryIndex,
                                  occurrence,
                                ])
                              ).values()
                            ).map((occurrence) => (
                              <button
                                key={`${repeat.word}-${occurrence.entryIndex}`}
                                type="button"
                                className={styles.potentialRepeatButton}
                                onClick={() => {
                                  const action: ClickedEntryAction = {
                                    type: 'CLICKEDENTRY',
                                    entryIndex: occurrence.entryIndex,
                                  };
                                  setShowPotentialRepeats(false);
                                  dispatch(action);
                                }}
                              >
                                <span
                                  className={styles.potentialRepeatEntryLabel}
                                >
                                  {occurrence.entryLabel}
                                </span>
                                <span
                                  className={styles.potentialRepeatEntryFill}
                                >
                                  <span>
                                    {occurrence.entryFill.slice(
                                      0,
                                      occurrence.startIndex
                                    )}
                                  </span>
                                  <span className={styles.potentialRepeatMatch}>
                                    {occurrence.entryFill.slice(
                                      occurrence.startIndex,
                                      occurrence.endIndex + 1
                                    )}
                                  </span>
                                  <span>
                                    {occurrence.entryFill.slice(
                                      occurrence.endIndex + 1
                                    )}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className={styles.potentialRepeatActions}>
                            <button
                              type="button"
                              className={styles.potentialRepeatReviewButton}
                              onClick={() => {
                                setReviewedPotentialRepeatKeys((previous) => {
                                  const next = new Set(previous);
                                  next.delete(potentialRepeatKey(repeat));
                                  return next;
                                });
                              }}
                            >
                              Mark as Unreviewed
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </Overlay>
        ) : (
          ''
        )}
        {state.showDownloadLink ? (
          <PuzDownloadOverlay
            state={state}
            cancel={() => {
              const a: SetShowDownloadLink = {
                type: 'SETSHOWDOWNLOAD',
                value: false,
              };
              dispatch(a);
            }}
          />
        ) : (
          ''
        )}
        {state.toPublish ? (
          <PublishOverlay
            id={state.id}
            toPublish={state.toPublish}
            warnings={state.publishWarnings}
            cancelPublish={() => {
              dispatch({ type: 'CANCELPUBLISH' });
            }}
          />
        ) : (
          ''
        )}
        {state.publishErrors.length ? (
          <PublishErrorsOverlay state={state} dispatch={dispatch} />
        ) : (
          ''
        )}
        <div className={styles.squareAndColsWrap}>
          <div
            style={{
              margin: '8px 0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <input
              type="text"
              placeholder="Add word to blacklist"
              value={manualBanWord}
              onChange={(e) => {
                setManualBanWord(e.target.value.replace(/\s+/g, ''));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitManualBan();
                }
              }}
              style={{
                padding: '4px 6px',
                fontSize: '0.9rem',
                width: '160px',
              }}
            />
            <Button onClick={submitManualBan} text="Ban" />
            <button
              type="button"
              title={puzzleStatsTooltip}
              onClick={() => {
                setShowPuzzleStats((value) => !value);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 0.9rem',
                border: '1px solid var(--secondary)',
                borderRadius: '999px',
                background: 'var(--bg)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 700,
              }}
            >
              <span>Total Words: {puzzleStats.totalWords}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 400 }}>
                {showPuzzleStats ? 'Hide stats' : 'Show stats'}
              </span>
            </button>
            {canRotateUnfilledGrid ? (
              <>
                <span
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                    opacity: 0.8,
                    marginLeft: '0.15rem',
                  }}
                >
                  Rotate grid
                </span>
                <button
                  type="button"
                  title="Rotate grid 90° left"
                  aria-label="Rotate grid 90 degrees left"
                  onClick={() => {
                    dispatch({ type: 'ROTATEGRIDLEFT' });
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2.5rem',
                    height: '2.5rem',
                    padding: 0,
                    border: '1px solid var(--secondary)',
                    borderRadius: '999px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <FaUndo />
                </button>
                <button
                  type="button"
                  title="Rotate grid 90° right"
                  aria-label="Rotate grid 90 degrees right"
                  onClick={() => {
                    dispatch({ type: 'ROTATEGRIDRIGHT' });
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2.5rem',
                    height: '2.5rem',
                    padding: 0,
                    border: '1px solid var(--secondary)',
                    borderRadius: '999px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transform: 'scaleX(-1)',
                  }}
                >
                  <FaUndo />
                </button>
              </>
            ) : null}
          </div>
          {showPuzzleStats ? (
            <section
              style={{
                margin: '0 0 1rem',
                padding: '1rem 1.25rem',
                border: '1px solid var(--secondary)',
                borderRadius: '0.75rem',
                background: 'var(--bg)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(10rem, max-content) minmax(6rem, max-content)',
                  gap: '0.35rem 1.25rem',
                  alignItems: 'baseline',
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>Size</div>
                <div style={{ fontSize: '1rem' }}>
                  {state.grid.width} x {state.grid.height}
                </div>

                <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                  Black Squares
                </div>
                <div style={{ fontSize: '1rem' }}>
                  {stats.numBlocks} ({puzzleStats.blackSquarePercent.toFixed(2)}
                  %)
                </div>

                <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                  Avg. Word Length
                </div>
                <div style={{ fontSize: '1rem' }}>
                  {puzzleStats.averageWordLength.toFixed(2)}
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    margin: '0 0 0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Word Counts</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setWordCountSort((value) =>
                        value === 'length' ? 'count' : 'length'
                      );
                    }}
                    style={{
                      padding: '0.25rem 0.55rem',
                      border: '1px solid var(--secondary)',
                      borderRadius: '999px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                    }}
                  >
                    {wordCountSort === 'length'
                      ? 'Sort: length'
                      : 'Sort: most to least'}
                  </button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))',
                    gap: '0.6rem 0.75rem',
                  }}
                >
                  {sortedWordCounts.map(({ length, count }) => (
                    <div
                      key={length}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.45rem 0.6rem',
                        border: '1px solid var(--secondary)',
                        borderRadius: '0.5rem',
                        background: 'var(--bg-hover)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: 'var(--text)',
                          opacity: 0.65,
                        }}
                      >
                        {length}-letter
                      </span>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'var(--text)',
                          opacity: 0.95,
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
          <SquareAndCols
            leftIsActive={state.active.dir === Direction.Across}
            aspectRatio={state.grid.width / state.grid.height}
            square={
              <GridView
                isEnteringRebus={state.isEnteringRebus}
                rebusValue={state.rebusValue}
                grid={state.grid}
                active={state.active}
                dispatch={dispatch}
                allowBlockEditing={true}
                autofill={props.autofillEnabled ? props.autofilledGrid : []}
                symmetry={state.symmetry}
                selection={state.selection}
                shortWordCells={shortWordCells}
              />
            }
            left={fillLists.left}
            right={fillLists.right}
            dispatch={dispatch}
          />
        </div>
        <div className="flexNone width100">
          <Keyboard
            toggleKeyboard={toggleKeyboard}
            keyboardHandler={keyboardHandler}
            muted={muted}
            showExtraKeyLayout={state.showExtraKeyLayout}
            includeBlockKey={true}
          />
        </div>
      </div>
    </>
  );
};
