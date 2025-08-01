import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreatePendingDto {
  staffId: number;
  date: string;
  status: string;
  start: number;
  end: number;
  memo?: string;
  pendingType: 'monthly-planner' | 'manual';
}

export interface ApprovalDto {
  reason?: string;
}

export interface BulkApprovalDto {
  pendingIds: number[];
  action: 'approve' | 'reject';
  reason?: string;
}

@Injectable()
export class PendingService {
  constructor(private prisma: PrismaService) {}

  /**
   * JST入力値を内部UTC時刻に変換
   */
  private jstToUtc(decimalHour: number, baseDateString: string): Date {
    const hours = Math.floor(decimalHour);
    const minutes = Math.round((decimalHour % 1) * 60);

    const jstIsoString = `${baseDateString}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00+09:00`;
    return new Date(jstIsoString);
  }

  /**
   * UTC時刻をJST小数点時刻に変換
   */
  private utcToJstDecimal(utcDate: Date): number {
    const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
    const hours = jstDate.getHours();
    const minutes = jstDate.getMinutes();
    return hours + minutes / 60;
  }

  /**
   * Pending作成
   */
  async create(createPendingDto: CreatePendingDto, creatorId: number) {
    console.log('Creating pending schedule:', createPendingDto);

    // 権限チェック：自分のpendingのみ作成可能
    // 一時的に無効化（認証システム統合まで）
    // if (createPendingDto.staffId !== creatorId) {
    //   throw new ForbiddenException('他の人のpendingは作成できません');
    // }

    // 対象スタッフIDが存在するかチェック
    const targetStaff = await this.prisma.staff.findUnique({
      where: { id: createPendingDto.staffId },
    });

    if (!targetStaff) {
      throw new BadRequestException(
        `スタッフID ${createPendingDto.staffId} が見つかりません`,
      );
    }

    // 作成者IDが存在するかチェック
    const creator = await this.prisma.staff.findUnique({
      where: { id: creatorId },
    });

    if (!creator) {
      // 実際に存在するスタッフIDを使用（認証システム修正まで）
      const firstStaff = await this.prisma.staff.findFirst();
      if (!firstStaff) {
        throw new BadRequestException('作成者が見つかりません');
      }
      creatorId = firstStaff.id;
    }

    const startUtc = this.jstToUtc(
      createPendingDto.start,
      createPendingDto.date,
    );
    const endUtc = this.jstToUtc(createPendingDto.end, createPendingDto.date);

    const pending = await this.prisma.adjustment.create({
      data: {
        staffId: createPendingDto.staffId,
        date: new Date(createPendingDto.date),
        status: createPendingDto.status,
        start: startUtc,
        end: endUtc,
        memo: createPendingDto.memo || null,
        reason: null,
        batchId: null,
        isPending: true,
        pendingType: createPendingDto.pendingType,
        updatedAt: new Date(),
      },
    });

    // 承認ログに記録
    await this.prisma.pending_approval_logs.create({
      data: {
        adjustmentId: pending.id,
        action: 'pending',
        actorId: creatorId,
        reason: 'Pending created',
      },
    });

    console.log('Pending created:', pending.id);
    return this.formatPendingResponse(pending);
  }

  /**
   * Pending取得（フィルター付き）
   */
  async findAll(filters: {
    staffId?: number;
    date?: string;
    department?: string;
    pendingType?: string;
  }) {
    const where: any = { isPending: true };

    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.date) where.date = new Date(filters.date);
    if (filters.pendingType) where.pendingType = filters.pendingType;

    const pendings = await this.prisma.adjustment.findMany({
      where,
      include: {
        Staff_Adjustment_staffIdToStaff: true,
        Staff_Adjustment_approvedByToStaff: {
          select: { id: true, name: true },
        },
        Staff_Adjustment_rejectedByToStaff: {
          select: { id: true, name: true },
        },
        pending_approval_logs: {
          include: {
            Staff: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 部署フィルター（Staffリレーション経由）
    const filteredPendings = filters.department
      ? pendings.filter(
          (p) =>
            p.Staff_Adjustment_staffIdToStaff.department === filters.department,
        )
      : pendings;

    return filteredPendings.map((p) => this.formatPendingResponse(p));
  }

  /**
   * 単一Pending取得
   */
  async findOne(id: number) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
      include: {
        Staff_Adjustment_staffIdToStaff: true,
        Staff_Adjustment_approvedByToStaff: {
          select: { id: true, name: true },
        },
        Staff_Adjustment_rejectedByToStaff: {
          select: { id: true, name: true },
        },
        pending_approval_logs: {
          include: {
            Staff: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    // 権限チェック：自分のpendingまたは管理者のみ閲覧可能
    // 一時的に無効化（認証システム統合まで）
    // if (!isAdmin && pending.staffId !== requesterId) {
    //   throw new ForbiddenException('このpendingを閲覧する権限がありません');
    // }

    return this.formatPendingResponse(pending);
  }

  /**
   * Pending更新（承認前のみ）
   */
  async update(id: number, updateData: Partial<CreatePendingDto>) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    // 権限チェック：自分のpendingのみ編集可能
    // 一時的に無効化（認証システム統合まで）
    // if (pending.staffId !== updaterId) {
    //   throw new ForbiddenException('他の人のpendingは編集できません');
    // }

    // 承認済み・却下済みは編集不可
    if (pending.approvedAt || pending.rejectedAt) {
      throw new BadRequestException(
        '承認済み・却下済みのpendingは編集できません',
      );
    }

    const updateFields: any = {};

    if (updateData.status) updateFields.status = updateData.status;
    if (updateData.memo !== undefined) updateFields.memo = updateData.memo;
    if (updateData.date) {
      updateFields.date = new Date(updateData.date);
      // 日付が変更された場合は時刻も再計算
      if (updateData.start) {
        updateFields.start = this.jstToUtc(updateData.start, updateData.date);
      } else if (pending.start) {
        // 既存の時刻を新しい日付で再計算
        const existingStartDecimal = this.utcToJstDecimal(pending.start);
        updateFields.start = this.jstToUtc(
          existingStartDecimal,
          updateData.date,
        );
      }
      if (updateData.end) {
        updateFields.end = this.jstToUtc(updateData.end, updateData.date);
      } else if (pending.end) {
        // 既存の時刻を新しい日付で再計算
        const existingEndDecimal = this.utcToJstDecimal(pending.end);
        updateFields.end = this.jstToUtc(existingEndDecimal, updateData.date);
      }
    } else {
      // 日付が変更されない場合の時刻更新
      if (updateData.start && updateData.date) {
        updateFields.start = this.jstToUtc(updateData.start, updateData.date);
      }
      if (updateData.end && updateData.date) {
        updateFields.end = this.jstToUtc(updateData.end, updateData.date);
      }
    }

    const updated = await this.prisma.adjustment.update({
      where: { id },
      data: updateFields,
    });

    console.log('Pending updated:', id);
    return this.formatPendingResponse(updated);
  }

  /**
   * Pending削除（承認前のみ）
   */
  async remove(id: number) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    // 権限チェック：自分のpendingのみ削除可能
    // 一時的に無効化（認証システム統合まで）
    // if (pending.staffId !== deleterId) {
    //   throw new ForbiddenException('他の人のpendingは削除できません');
    // }

    // 承認済みは削除不可、却下済みは削除可能
    if (pending.approvedAt) {
      throw new BadRequestException('承認済みのpendingは削除できません');
    }

    // まずApprovalLogsを削除
    await this.prisma.pending_approval_logs.deleteMany({
      where: { adjustmentId: id },
    });

    // その後Adjustmentを削除
    await this.prisma.adjustment.delete({
      where: { id },
    });

    console.log('Pending deleted:', id);
    return { success: true, message: 'Pendingを削除しました' };
  }

  /**
   * Pending承認
   */
  async approve(id: number, approvalDto: ApprovalDto, approverId: number) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    if (pending.approvedAt || pending.rejectedAt) {
      throw new BadRequestException('既に処理済みのpendingです');
    }

    // 承認者IDが存在するかチェック
    const approver = await this.prisma.staff.findUnique({
      where: { id: approverId },
    });

    if (!approver) {
      // 実際に存在するスタッフIDを使用（認証システム修正まで）
      const firstStaff = await this.prisma.staff.findFirst();
      if (!firstStaff) {
        throw new BadRequestException('承認者が見つかりません');
      }
      approverId = firstStaff.id;
    }

    const approved = await this.prisma.adjustment.update({
      where: { id },
      data: {
        // isPending: true を維持（月次計画で承認済み予定を表示するため）
        approvedBy: approverId,
        approvedAt: new Date(),
      },
    });

    // 承認ログに記録
    await this.prisma.pending_approval_logs.create({
      data: {
        adjustmentId: id,
        action: 'approved',
        actorId: approverId,
        reason: approvalDto.reason || 'Approved',
      },
    });

    console.log('Pending approved:', id);
    return this.formatPendingResponse(approved);
  }

  /**
   * Pending却下
   */
  async reject(id: number, approvalDto: ApprovalDto, rejectorId: number) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    if (pending.approvedAt || pending.rejectedAt) {
      throw new BadRequestException('既に処理済みのpendingです');
    }

    // 却下者IDが存在するかチェック
    const rejector = await this.prisma.staff.findUnique({
      where: { id: rejectorId },
    });

    if (!rejector) {
      // 実際に存在するスタッフIDを使用（認証システム修正まで）
      const firstStaff = await this.prisma.staff.findFirst();
      if (!firstStaff) {
        throw new BadRequestException('却下者が見つかりません');
      }
      rejectorId = firstStaff.id;
    }

    const rejected = await this.prisma.adjustment.update({
      where: { id },
      data: {
        rejectedBy: rejectorId,
        rejectedAt: new Date(),
        rejectionReason: approvalDto.reason || 'Rejected',
      },
    });

    // 却下ログに記録
    await this.prisma.pending_approval_logs.create({
      data: {
        adjustmentId: id,
        action: 'rejected',
        actorId: rejectorId,
        reason: approvalDto.reason || 'Rejected',
      },
    });

    console.log('Pending rejected:', id);
    return this.formatPendingResponse(rejected);
  }

  /**
   * 承認済み予定の承認取り消し（削除扱い）
   */
  async unapprove(id: number, reason: string, actorId: number) {
    const pending = await this.prisma.adjustment.findUnique({
      where: { id, isPending: true },
    });

    if (!pending) {
      throw new NotFoundException('Pendingが見つかりません');
    }

    if (!pending.approvedAt) {
      throw new BadRequestException(
        '承認済みでないpendingは取り消しできません',
      );
    }

    if (pending.rejectedAt) {
      throw new BadRequestException('既に却下済みのpendingです');
    }

    // アクターIDが存在するかチェック
    const actor = await this.prisma.staff.findUnique({
      where: { id: actorId },
    });

    if (!actor) {
      // 実際に存在するスタッフIDを使用（認証システム修正まで）
      const firstStaff = await this.prisma.staff.findFirst();
      if (!firstStaff) {
        throw new BadRequestException('実行者が見つかりません');
      }
      actorId = firstStaff.id;
    }

    const unapproved = await this.prisma.adjustment.update({
      where: { id },
      data: {
        approvedBy: null,
        approvedAt: null,
        rejectedBy: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason || '承認取り消し',
      },
    });

    // 承認取り消しログに記録
    await this.prisma.pending_approval_logs.create({
      data: {
        adjustmentId: id,
        action: 'unapproved',
        actorId: actorId,
        reason: reason || '承認取り消し',
      },
    });

    return this.formatPendingResponse(unapproved);
  }

  /**
   * 一括承認・却下
   */
  async bulkApproval(bulkDto: BulkApprovalDto, actorId: number) {
    console.log(
      `Bulk ${bulkDto.action} for ${bulkDto.pendingIds.length} pendings`,
    );

    const now = new Date();
    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    try {
      // 対象のPending一覧を事前取得（存在確認とエラー検出）
      const targetPendings = await this.prisma.adjustment.findMany({
        where: {
          id: { in: bulkDto.pendingIds },
          isPending: true,
        },
        select: { id: true, staffId: true, approvedAt: true, rejectedAt: true },
      });

      // 存在しないIDや既に処理済みのIDをエラーとして記録
      const existingIds = targetPendings.map((p) => p.id);
      const missingIds = bulkDto.pendingIds.filter(
        (id) => !existingIds.includes(id),
      );
      const processedPendings = targetPendings.filter(
        (p) => p.approvedAt || p.rejectedAt,
      );

      // エラー記録
      missingIds.forEach((id) => {
        errors.push({ pendingId: id, error: 'Pendingが見つかりません' });
        failedCount++;
      });
      processedPendings.forEach((p) => {
        errors.push({ pendingId: p.id, error: '既に承認または却下済みです' });
        failedCount++;
      });

      // 処理可能なPendingのIDリスト
      const validPendingIds = targetPendings
        .filter((p) => !p.approvedAt && !p.rejectedAt)
        .map((p) => p.id);

      if (validPendingIds.length > 0) {
        if (bulkDto.action === 'approve') {
          // 一括承認
          const updateResult = await this.prisma.adjustment.updateMany({
            where: {
              id: { in: validPendingIds },
              isPending: true,
            },
            data: {
              approvedAt: now,
              approvedBy: actorId,
              reason: bulkDto.reason || null,
              // isPending: true を維持（月次計画で承認済み予定を表示するため）
              updatedAt: now,
            },
          });
          successCount = updateResult.count;

          // 承認ログ一括作成
          const approvalLogs = validPendingIds.map((id) => ({
            adjustmentId: id,
            actorId: actorId,
            action: 'approve' as const,
            reason: bulkDto.reason || null,
            createdAt: now,
          }));
          await this.prisma.pending_approval_logs.createMany({
            data: approvalLogs,
          });
        } else {
          // 一括却下
          const updateResult = await this.prisma.adjustment.updateMany({
            where: {
              id: { in: validPendingIds },
              isPending: true,
            },
            data: {
              rejectedAt: now,
              rejectedBy: actorId,
              rejectionReason: bulkDto.reason || null,
              // isPending: true を維持（月次計画で却下済み予定も表示するため）
              updatedAt: now,
            },
          });
          successCount = updateResult.count;

          // 却下ログ一括作成
          const rejectionLogs = validPendingIds.map((id) => ({
            adjustmentId: id,
            actorId: actorId,
            action: 'reject' as const,
            reason: bulkDto.reason || null,
            createdAt: now,
          }));
          await this.prisma.pending_approval_logs.createMany({
            data: rejectionLogs,
          });
        }

        console.log(
          `Bulk ${bulkDto.action} completed: ${successCount} processed`,
        );
      }
    } catch (error) {
      console.error('Bulk approval failed:', error);
      throw new BadRequestException(
        `一括${bulkDto.action === 'approve' ? '承認' : '却下'}に失敗しました`,
      );
    }

    return {
      successCount,
      failedCount,
      errors,
      totalProcessed: successCount + failedCount,
    };
  }

  /**
   * 管理者用：全pending一覧
   */
  async findAllForAdmin(filters: {
    date?: string;
    startDate?: string;
    endDate?: string;
    department?: string;
    status?: 'pending' | 'approved' | 'rejected';
  }) {
    const where: any = { isPending: true };

    // 日付フィルター処理（CLAUDE.md時刻処理ルール準拠）
    if (filters.date) {
      // 単一日付フィルター（既存の互換性を保持）
      where.date = new Date(filters.date);
    } else if (filters.startDate || filters.endDate) {
      // 日付範囲フィルター
      where.date = {};
      if (filters.startDate) {
        // startDate以降（以上）
        where.date.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // endDate以前（以下）
        where.date.lte = new Date(filters.endDate);
      }
    }

    // ステータスフィルター
    if (filters.status === 'approved') {
      where.approvedAt = { not: null };
    } else if (filters.status === 'rejected') {
      where.rejectedAt = { not: null };
    } else if (filters.status === 'pending') {
      where.approvedAt = null;
      where.rejectedAt = null;
    }

    const pendings = await this.prisma.adjustment.findMany({
      where,
      include: {
        Staff_Adjustment_staffIdToStaff: true,
        Staff_Adjustment_approvedByToStaff: {
          select: { id: true, name: true },
        },
        Staff_Adjustment_rejectedByToStaff: {
          select: { id: true, name: true },
        },
        pending_approval_logs: {
          include: {
            Staff: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 部署フィルター
    const filteredPendings = filters.department
      ? pendings.filter(
          (p) =>
            p.Staff_Adjustment_staffIdToStaff.department === filters.department,
        )
      : pendings;

    return filteredPendings.map((p) => this.formatPendingResponse(p));
  }

  /**
   * 月次計画専用：承認済み・未承認両方のpending予定取得
   */
  async findAllForMonthlyPlanner(year: number, month: number) {
    console.log(`Monthly planner: fetching pendings for ${year}-${month}`);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const pendings = await this.prisma.adjustment.findMany({
      where: {
        isPending: true, // pending予定のみ（承認済み・未承認両方）
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        Staff_Adjustment_staffIdToStaff: {
          select: { id: true, name: true, department: true, group: true },
        },
        Staff_Adjustment_approvedByToStaff: {
          select: { id: true, name: true },
        },
        Staff_Adjustment_rejectedByToStaff: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ date: 'asc' }, { start: 'asc' }],
    });

    return pendings.map((p) => this.formatPendingResponse(p));
  }

  /**
   * レスポンス形式統一
   */
  private formatPendingResponse(pending: any) {
    return {
      id: pending.id,
      staffId: pending.staffId,
      staffName: pending.Staff_Adjustment_staffIdToStaff?.name,
      date: pending.date,
      status: pending.status,
      start: this.utcToJstDecimal(pending.start),
      end: this.utcToJstDecimal(pending.end),
      memo: pending.memo,
      isPending: pending.isPending,
      pendingType: pending.pendingType,
      approvedBy: pending.Staff_Adjustment_approvedByToStaff,
      approvedAt: pending.approvedAt,
      rejectedBy: pending.Staff_Adjustment_rejectedByToStaff,
      rejectedAt: pending.rejectedAt,
      rejectionReason: pending.rejectionReason,
      approvalLogs: pending.pending_approval_logs || [],
      createdAt: pending.createdAt,
      updatedAt: pending.updatedAt,
    };
  }
}
