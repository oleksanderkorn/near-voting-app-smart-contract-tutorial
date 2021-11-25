import { PersistentSet, context, PersistentMap, RNG } from "near-sdk-core";
import { Timestamp } from "../../utils";
import {
  Candidate,
  CandidateVotes,
  Election,
  ElectionInfo,
  ElectionVotes,
  Vote,
} from "./model";
@nearBindgen
export class Contract {
  private elections: PersistentMap<u32, Election>;
  private electionIds: PersistentSet<u32>;

  constructor() {
    this.elections = new PersistentMap<u32, Election>("e");
    this.electionIds = new PersistentSet<u32>("ei");
  }

  get_elections(): ElectionInfo[] {
    const electionIds = this.electionIds.values();
    let elections: ElectionInfo[] = [];
    for (let i: i32 = 0; i < electionIds.length; i++) {
      elections.push(this.elections.getSome(electionIds[i]).electionInfo);
    }
    return elections;
  }

  get_candidates(electionId: u32): Candidate[] {
    assert(
      this.elections.contains(electionId),
      `No election with id [${electionId}] found. Did you mistype?`
    );
    return this.elections.getSome(electionId).candidates.values();
  }

  get_votes(electionId: u32): ElectionVotes {
    assert(
      this.elections.contains(electionId),
      `No election with id [${electionId}] found. Did you mistype?`
    );
    const election = this.elections.getSome(electionId);
    const allCandidates = election.candidates.values();
    const candidatesVotes: CandidateVotes[] = [];
    for (let i: i32 = 0; i < allCandidates.length; i++) {
      const candidate = allCandidates[i];
      let votes: Vote[];
      if (election.votes.contains(candidate.accountId)) {
        votes = election.votes.getSome(candidate.accountId).values();
      } else {
        votes = [];
      }
      const candidateVote = new CandidateVotes(candidate, votes);
      candidatesVotes.push(candidateVote);
    }
    return new ElectionVotes(election.electionInfo, candidatesVotes);
  }

  @mutateState()
  add_election(
    title: string,
    description: string,
    startDate: Timestamp,
    endDate: Timestamp
  ): void {
    const rng = new RNG<u16>(1, u16.MAX_VALUE);
    const electionId = rng.next();
    const start =
      startDate > 0
        ? startDate * 1000000
        : context.blockTimestamp + 86400000000000;
    const election = new Election(
      electionId,
      context.sender,
      context.blockTimestamp,
      startDate > 0
        ? startDate * 1000000
        : context.blockTimestamp + 86400000000000,
      endDate > 0 ? endDate * 1000000 : start + 86400000000000 * 7,
      title,
      description
    );
    this.electionIds.add(electionId);
    this.elections.set(electionId, election);
  }

  @mutateState()
  add_candidacy(
    electionId: u32,
    name: string,
    slogan: string,
    goals: string
  ): void {
    const candidateId = context.sender;
    assert(
      this.elections.contains(electionId),
      `No election with id [${electionId}] found. Did you mistype?`
    );
    const election = this.elections.getSome(electionId);
    assert(
      election.electionInfo.startDate > context.blockTimestamp,
      "Could not add candidacy to the ongoing elections."
    );
    assert(
      !election.candidateIds.has(candidateId),
      "Candidate is already registered in this election, dont cheat! Your votes will not sum up in case you register yourself twice :)"
    );
    assert(
      name.length > 0,
      "Name is required, put your account ID as name if you was us to put it on the election billboard!"
    );
    assert(
      slogan.length > 0,
      "Slogan is required, what are you going to print on the snapbacks abd t-shirts?"
    );
    assert(
      goals.length > 0,
      "Goals is required, who will vote to you withouth "
    );

    const date = context.blockTimestamp;
    const candidate = new Candidate(candidateId, date, name, slogan, goals);
    election.candidates.add(candidate);
    election.candidateIds.add(candidateId);
    this.elections.set(electionId, election);
  }

  @mutateState()
  add_vote(electionId: u32, candidateId: string, comment: string): void {
    assert(
      this.elections.contains(electionId),
      `No election with id [${electionId}] found. Did you mistype?`
    );
    const election = this.elections.getSome(electionId);
    assert(
      election.electionInfo.startDate < context.blockTimestamp,
      "Could not add vote to the election which is not yet started."
    );
    assert(
      election.electionInfo.endDate > context.blockTimestamp,
      "Could not add vote to the election which is already finished."
    );
    const voterId = context.sender;
    const date = context.blockTimestamp;
    const donation = context.attachedDeposit;
    assert(
      election.candidateIds.has(candidateId),
      "Candidate is not registered in the election. Maybe you mistyped his account id?"
    );

    assert(!election.voters.has(voterId), "Sorry, you can only vote once!");
    election.voters.add(voterId);
    const vote = new Vote(
      voterId,
      date,
      candidateId,
      comment ? comment : "",
      donation
    );

    let votes = election.votes.get(candidateId);
    if (votes == null) {
      votes = new PersistentSet<Vote>("vt");
    }
    votes.add(vote);
    election.votes.set(candidateId, votes);
    this.elections.set(electionId, election);
  }
}
