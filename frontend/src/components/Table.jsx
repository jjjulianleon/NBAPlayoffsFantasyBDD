import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Table({ columns, rows, sortable = false, onRowClick, rowClassName }) {
  const [sortState, setSortState] = useState(null);

  const sortedRows = [...rows];
  if (sortable && sortState) {
    const column = columns.find((item) => item.key === sortState.key);
    if (column) {
      const direction = sortState.direction === 'asc' ? 1 : -1;
      sortedRows.sort((left, right) => {
        const leftValue = column.sortValue ? column.sortValue(left) : left[column.key];
        const rightValue = column.sortValue ? column.sortValue(right) : right[column.key];

        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          return (leftValue - rightValue) * direction;
        }

        return String(leftValue ?? '').localeCompare(String(rightValue ?? '')) * direction;
      });
    }
  }

  function toggleSort(key) {
    if (!sortable) {
      return;
    }

    setSortState((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'desc' };
      }
      if (current.direction === 'desc') {
        return { key, direction: 'asc' };
      }
      return null;
    });
  }

  function getSortIcon(columnKey) {
    if (!sortable) {
      return null;
    }
    if (!sortState || sortState.key !== columnKey) {
      return <ArrowUpDown className="h-3.5 w-3.5" />;
    }
    return sortState.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-elev]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[--color-border] bg-[--color-bg-elev-2]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-[11px] font-body font-semibold uppercase tracking-[0.22em] text-[--color-text-muted]',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      'inline-flex items-center gap-2',
                      sortable ? 'cursor-pointer transition-colors hover:text-[--color-text]' : 'cursor-default',
                      column.align === 'right' && 'ml-auto',
                    )}
                  >
                    <span>{column.label}</span>
                    {getSortIcon(column.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => (
              <tr
                key={row.id ?? row.key ?? index}
                className={cn('table-row', typeof rowClassName === 'function' ? rowClassName(row) : rowClassName)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') {
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3 align-middle', column.align === 'right' && 'text-right')}
                  >
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
