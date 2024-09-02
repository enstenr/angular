/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {TsurgeFunnelMigration, TsurgeMigration} from '../migration';
import {MockFileSystem} from '@angular/compiler-cli/src/ngtsc/file_system/testing';
import {
  absoluteFrom,
  AbsoluteFsPath,
  getFileSystem,
} from '@angular/compiler-cli/src/ngtsc/file_system';
import {groupReplacementsByFile} from '../helpers/group_replacements';
import {applyTextUpdates} from '../replacement';
import ts from 'typescript';

/**
 * Runs the given migration against a fake set of files, emulating
 * migration of a real TypeScript Angular project.
 *
 * Note: This helper does not execute the migration in batch mode, where
 * e.g. the migration runs per single file and merges the unit data.
 *
 * TODO: Add helper/solution to test batch execution, like with Tsunami.
 *
 * @returns a mock file system with the applied replacements of the migration.
 */
export async function runTsurgeMigration<UnitData, GlobalData>(
  migration: TsurgeMigration<UnitData, GlobalData>,
  files: {name: AbsoluteFsPath; contents: string; isProgramRootFile?: boolean}[],
  compilerOptions: ts.CompilerOptions = {},
): Promise<MockFileSystem> {
  const mockFs = getFileSystem();
  if (!(mockFs instanceof MockFileSystem)) {
    throw new Error('Expected a mock file system for `runTsurgeMigration`.');
  }

  for (const file of files) {
    mockFs.ensureDir(mockFs.dirname(file.name));
    mockFs.writeFile(file.name, file.contents);
  }

  const rootFiles = files.filter((f) => f.isProgramRootFile).map((f) => f.name);

  mockFs.writeFile(
    absoluteFrom('/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        rootDir: '/',
        ...compilerOptions,
      },
      files: rootFiles,
    }),
  );

  const baseInfo = migration.createProgram('/tsconfig.json', mockFs);
  const info = migration.prepareProgram(baseInfo);

  const unitData = await migration.analyze(info);
  const merged = await migration.merge([unitData]);
  const replacements =
    migration instanceof TsurgeFunnelMigration
      ? await migration.migrate(merged)
      : await migration.migrate(merged, info);

  const updates = groupReplacementsByFile(replacements);
  for (const [projectRelativePath, changes] of updates.entries()) {
    const absolutePath = mockFs.resolve('/', projectRelativePath);
    mockFs.writeFile(absolutePath, applyTextUpdates(mockFs.readFile(absolutePath), changes));
  }

  return mockFs;
}
