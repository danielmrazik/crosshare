import {
  CSSProperties,
  Dispatch,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  cellIndex,
  entryIndexAtPosition,
  getEntryCells,
} from '../lib/gridBase.js';
import {
  GridSelection,
  getSelectionCells,
  hasMultipleCells,
} from '../lib/selection.js';
import { BLOCK, PosAndDir, Position, Symmetry } from '../lib/types.js';
import { ViewableEntry, ViewableGrid, flipped } from '../lib/viewableGrid.js';
import {
  StartSelectionAction,
  UpdateSelectionAction,
} from '../reducers/builderReducer.js';
import { PuzzleAction } from '../reducers/commonActions.js';
import { SetActivePositionAction } from '../reducers/gridReducer.js';
import { Cell } from './Cell.js';

interface GridViewProps {
  grid: ViewableGrid<ViewableEntry>;
  defaultGrid?: ViewableGrid<ViewableEntry>; // This is used for the add alternate solution interface
  active: PosAndDir;
  dispatch: Dispatch<PuzzleAction>;
  revealedCells?: Set<number>;
  verifiedCells?: Set<number>;
  isEnteringRebus?: boolean;
  rebusValue?: string;
  wrongCells?: Set<number>;
  allowBlockEditing?: boolean;
  autofill?: string[];
  cellColors?: Array<number | undefined>;
  entryRefs?: Set<number>[];
  showAlternates?: [number, string][][] | null;
  answers?: string[] | null;
  symmetry?: Symmetry | null;
  selection?: GridSelection;
  shortWordCells?: Set<number>;
}

export const GridView = ({
  active,
  dispatch,
  grid,
  ...props
}: GridViewProps) => {
  const entryCells = getEntryCells(grid, active);
  const entryCellIndexes = new Set(entryCells.map((p) => cellIndex(grid, p)));
  const entryIdx = entryIndexAtPosition(grid, active);
  const hasSelection = hasMultipleCells(props.selection);
  const selectedCells = getSelectionCells(props.selection);
  let refedCells: Position[] = [];
  if (entryIdx !== null) {
    const refedCellsSet = new Set(entryCells);
    if (props.entryRefs) {
      props.entryRefs[entryIdx]?.forEach((refedEntryIdx) => {
        const refedEntry = grid.entries[refedEntryIdx];
        if (refedEntry) {
          refedEntry.cells.forEach((p) => refedCellsSet.add(p));
        }
      });
    }
    refedCells = [...refedCellsSet];
  }

  // We use this counter to rotate through possible correct grids
  // when there are multiple solutions
  const [counter, setCounter] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setCounter(counter + 1);
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [counter]);

  const noOp = useCallback(() => undefined, []);
  const changeActive = useCallback(
    (pos: Position, shiftKey: boolean) => {
      const a: SetActivePositionAction = {
        type: 'SETACTIVEPOSITION',
        newActive: pos,
        shiftKey,
      };
      dispatch(a);
    },
    [dispatch]
  );
  const changeDirection = useCallback(() => {
    dispatch({ type: 'CHANGEDIRECTION' });
  }, [dispatch]);
  const startSelection = useCallback(
    (position: Position) => {
      dispatch({ type: 'STARTSELECTION', position } as StartSelectionAction);
    },
    [dispatch]
  );
  const updateSelection = useCallback(
    (position: Position) => {
      dispatch({ type: 'UPDATESELECTION', position } as UpdateSelectionAction);
    },
    [dispatch]
  );

  let altToShow: string[] = [];
  if (props.answers && props.showAlternates?.length) {
    altToShow = [...props.answers];
    const altIndex = counter % (props.showAlternates.length + 1);
    if (altIndex > 0) {
      props.showAlternates[altIndex - 1]?.forEach(([n, s]) => {
        altToShow[n] = s;
      });
    }
  }

  let activeEntryOutline: ReactNode = null;
  if (entryCells.length > 0 && !hasSelection) {
    const rows = entryCells.map((cell) => cell.row);
    const cols = entryCells.map((cell) => cell.col);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const outlineWidth = '0.09em';
    const outlineStyle: CSSProperties = {
      pointerEvents: 'none',
      position: 'absolute',
      top: `${(100 * minRow) / grid.height}%`,
      left: `${(100 * minCol) / grid.width}%`,
      width: `${(100 * (maxCol - minCol + 1)) / grid.width}%`,
      height: `${(100 * (maxRow - minRow + 1)) / grid.height}%`,
      boxShadow: `inset 0 0 0 ${outlineWidth} var(--entry-cell)`,
      boxSizing: 'border-box',
      zIndex: 2,
    };
    activeEntryOutline = <div aria-hidden style={outlineStyle} />;
  }

  const cells = new Array<ReactNode>();
  for (const [idx, cellValue] of grid.cells.entries()) {
    const defaultCellValue = props.defaultGrid?.cells[idx];
    const number = grid.cellLabels.get(idx);
    const isActive = cellIndex(grid, active) === idx;
    let onClick = changeActive;
    if (cellValue === BLOCK && !props.allowBlockEditing) {
      onClick = noOp;
    } else if (isActive) {
      onClick = changeDirection;
    }
    let toDisplay = cellValue;
    let showAsVerified = false;
    if (defaultCellValue) {
      if (cellValue.trim() && cellValue.trim() != defaultCellValue.trim()) {
        showAsVerified = true;
      } else {
        toDisplay = defaultCellValue;
      }
    }
    if (altToShow.length) {
      toDisplay = altToShow[idx] || toDisplay;
    }

    const col = idx % grid.width;
    const row = Math.floor(idx / grid.height);
    const isEntryCell = entryCellIndexes.has(idx);

    const symmetricalCell =
      props.symmetry != Symmetry.None && props.symmetry != null
        ? flipped(grid, active, props.symmetry)
        : null;
    const isOpposite = !isActive && symmetricalCell === idx;
    cells.push(
      <Cell
        barRight={grid.vBars.has(idx)}
        barBottom={grid.hBars.has(idx)}
        hidden={grid.hidden.has(idx)}
        hiddenRight={col < grid.width - 1 && grid.hidden.has(idx + 1)}
        hiddenBottom={
          row < grid.height - 1 && grid.hidden.has(idx + grid.width)
        }
        isEnteringRebus={props.isEnteringRebus || false}
        rebusValue={props.rebusValue}
        autofill={props.autofill?.[idx] ?? ''}
        gridWidth={grid.width}
        gridHeight={grid.height}
        active={isActive}
        entryCell={isEntryCell}
        refedCell={refedCells.some((p) => cellIndex(grid, p) === idx)}
        selected={selectedCells.some((p) => cellIndex(grid, p) === idx)}
        isSelecting={hasSelection}
        shortWordCell={props.shortWordCells?.has(idx) ?? false}
        key={idx}
        number={number ? number.toString() : ''}
        row={Math.floor(idx / grid.width)}
        column={idx % grid.width}
        onClick={onClick}
        onMouseDown={startSelection}
        onMouseEnter={updateSelection}
        value={toDisplay}
        isBlock={cellValue === BLOCK}
        isOpposite={isOpposite}
        isVerified={props.verifiedCells?.has(idx) || showAsVerified}
        isWrong={props.wrongCells?.has(idx)}
        wasRevealed={props.revealedCells?.has(idx)}
        styles={Array.from(grid.cellStyles.entries())
          .filter(([_style, cells]) => cells.has(idx))
          .map(([style, _cells]) => style)}
        cellColor={props.cellColors?.[idx]}
      />
    );
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>{cells}</div>
      {activeEntryOutline}
    </div>
  );
};
