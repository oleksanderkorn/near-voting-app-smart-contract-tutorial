import { PersistentMap, PersistentSet, u128 } from "near-sdk-as";
import { AccountId, Timestamp } from "../../utils";

@nearBindgen
export class Candidate {
  constructor(
    public accountId: AccountId,
    public registrationDate: Timestamp,
    public name: string,
    public slogan: string,
    public goals: string
  ) {}
}

@nearBindgen
export class Vote {
  constructor(
    public accountId: AccountId,
    public date: Timestamp,
    public candidateId: AccountId,
    public comment: string,
    public donation: u128
  ) {}
}

@nearBindgen
export class ElectionInfo {
  constructor(
    public id: u32,
    public initiator: AccountId,
    public creationDate: Timestamp,
    public startDate: Timestamp,
    public endDate: Timestamp,
    public title: string,
    public description: string
  ) {}
}

@nearBindgen
export class CandidateVotes {
  constructor(public candidate: Candidate, public votes: Vote[]) {}
}

@nearBindgen
export class ElectionVotes {
  constructor(public election: ElectionInfo, public votes: CandidateVotes[]) {}
}

@nearBindgen
export class Election {
  public candidates: PersistentSet<Candidate>;
  public candidateIds: PersistentSet<string>;
  public votes: PersistentMap<AccountId, PersistentSet<Vote>>;
  public voters: PersistentSet<AccountId>;
  public electionInfo: ElectionInfo;

  constructor(
    id: u16,
    initiator: AccountId,
    creationDate: Timestamp,
    startDate: Timestamp,
    endDate: Timestamp,
    title: string,
    description: string
  ) {
    this.electionInfo = new ElectionInfo(
      id,
      initiator,
      creationDate,
      startDate,
      endDate,
      title,
      description
    );
    this.candidates = new PersistentSet<Candidate>(`e${id}_c`);
    this.votes = new PersistentMap<AccountId, PersistentSet<Vote>>(`e${id}_v`);
    this.candidateIds = new PersistentSet<string>(`e${id}_ci`);
    this.voters = new PersistentSet<AccountId>(`e${id}_vt`);
  }
}
