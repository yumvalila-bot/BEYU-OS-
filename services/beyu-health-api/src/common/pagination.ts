export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function resolvePagination(query: PaginationQuery) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? query.limit ?? 20)));
  const offset = query.offset != null ? Number(query.offset) : (page - 1) * pageSize;
  return { page, pageSize, limit: pageSize, offset };
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    data: items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
