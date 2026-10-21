<script setup lang="ts">
export type TableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

defineProps<{
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  rowClass?: (row: Record<string, unknown>, index: number) => string;
  stickyFirst?: boolean;
}>();
</script>

<template>
  <div class="wb-table-wrap">
    <table class="wb-table">
      <thead>
        <tr>
          <th
            v-for="(column, index) in columns"
            :key="column.key"
            :class="{ 'is-num': column.align === 'right', 'is-sticky': stickyFirst && index === 0 }"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index" :class="rowClass?.(row, index)">
          <td
            v-for="(column, columnIndex) in columns"
            :key="column.key"
            :class="{
              'is-num': column.align === 'right',
              'is-sticky': stickyFirst && columnIndex === 0,
              'is-missing': row[column.key] === '—',
            }"
          >
            {{ row[column.key] ?? '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
