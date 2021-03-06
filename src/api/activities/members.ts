import { Router } from "express";
import { ERR_ACCESS_DENIED, ERR_BAD_REQUEST, ERR_NOT_FOUND } from "../../constant";
import { Activity, ActivityState } from "../../entity/activity";
import { Chance } from "../../entity/chance";
import { Member } from "../../entity/member";
import { Team } from "../../entity/team";
import { User } from "../../entity/user";
import { ensure, Wrap } from "../util";
import { canOperateDuringReg } from "./utils";

export const ActivityMembersRouter = Router();

ActivityMembersRouter.get("/:id/members", Wrap(async (req, res) => {
    const members = await Member.find({ activityId: req.params.id });
    res.RESTSend(members);
}));

// 创建义工成员
ActivityMembersRouter.post("/:id/members", Wrap(async (req, res) => {
    const activity = await Activity.findOne(req.params.id);
    ensure(activity, ERR_NOT_FOUND);
    ensure(activity.state === ActivityState.Registration, ERR_BAD_REQUEST);

    const user = await User.findOne(req.body.userId);
    ensure(user, ERR_NOT_FOUND);
    ensure(user.id === req.body.userId, ERR_BAD_REQUEST);
    const chance = await Chance.findOne({ groupId: user.groupId, activityId: activity.id });
    ensure(chance, ERR_ACCESS_DENIED);
    ensure(chance.quota, ERR_ACCESS_DENIED);
    ensure(canOperateDuringReg(req.user, user, chance.isPublic), ERR_ACCESS_DENIED);

    const team = await Team.findOne(req.body.teamId);
    ensure(team, ERR_NOT_FOUND);
    ensure(team.activityId === activity.id, ERR_BAD_REQUEST);
    ensure(team.id === req.body.teamId, ERR_BAD_REQUEST);

    const member = new Member();
    member.user = user;
    member.team = team;
    member.activity = activity;

    await member.save();
    chance.quota--;
    await chance.save();

    res.RESTSend(member.id);
}));

// 获取义工成员
ActivityMembersRouter.get("/:id/members/:mid", Wrap(async (req, res) => {
    const member = await Member.findOne(req.params.mid, { relations: ["user"] });
    ensure(member, ERR_NOT_FOUND);
    ensure(member.activityId === req.params.id);
    res.RESTSend(member);
}));

// 删除义工成员
ActivityMembersRouter.delete("/:id/members/:mid", Wrap(async (req, res) => {
    const member = await Member.findOne(req.params.mid, { relations: ["user", "activity"] });
    ensure(member, ERR_NOT_FOUND);
    ensure(member.activityId === req.params.id, ERR_BAD_REQUEST);
    ensure(member.activity.state === ActivityState.Registration, ERR_BAD_REQUEST);

    const chance = await Chance.findOne({ groupId: member.user.groupId, activityId: member.activity.id });
    ensure(canOperateDuringReg(req.user, member.user, chance.isPublic), ERR_ACCESS_DENIED);

    await member.remove();
    chance.quota++;
    await chance.save();

    res.RESTEnd();
}));

// 更新某个成员
ActivityMembersRouter.put("/:id/members/:mid", Wrap(async (req, res) => {
    const member = await Member.findOne(req.params.mid, { relations: ["team", "activity"] });
    ensure(member, ERR_NOT_FOUND);
    ensure(member.activityId === req.params.id, ERR_BAD_REQUEST);
    ensure(req.userId === member.team.leaderId || req.user.isAdministrator || req.user.isManager, ERR_ACCESS_DENIED);
    ensure(member.activity.state === ActivityState.PendingVerify, ERR_BAD_REQUEST);

    member.comment = req.body.comment;
    member.leaderReview = req.body.leaderReview;
    if (req.user.isManager || req.user.isAdministrator) {
        member.iTime = req.body.iTime;
        member.oTime = req.body.oTime;
        member.uTime = req.body.uTime;
        member.managerReview = req.body.managerReview;
        if (req.user.isAdministrator) {
            member.administratorReview = req.body.administratorReview;
        }
    }
    await member.save();

    res.RESTEnd();
}));
