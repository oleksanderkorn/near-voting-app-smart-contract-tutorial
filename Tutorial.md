# Voting App Smart Contract Tutorial

Welcome to the Voting App Near Smart Contract Tutorial!
Here you can find the detailed steps of what we are going to implement, how to build, run, and deploy it to the testnet.
This tutorial is based on [near-sdk-as Starter Kit](https://github.com/Learn-NEAR/starter--near-sdk-as) which contains AssemblyScript written in Typescript
and allows everyone to write and deploy smart contracts using TypeScript instead of Rust.
You are using `yarn` tasks to build the smart contract.

## Prerequisites

Make sure you have installed [nodejs](https://nodejs.org/en/download/) 12+, [yarn](https://yarnpkg.com/) and the latest [near-cli](https://github.com/near/near-cli).

## Voting App Smart Contract Description

The Voting App Contract we are going to build is designed to support multiple ongoing elections. Here are the supported features:

- Any election can have unlimited amount of candidates.
- Every near user can vote, but only once for one of the candidates.
- Every election has `startDate` and `endDate` properties which are used to control the election process.
- Any candidate can add his candidacy before the election `startDate`.
- A user can only add his vote for the specific election, if the election has already started, meaning `currentTime > election.startDate`.

## Tutorial

To start building the new smart contract using AssemblyScript you can close use this repository and apply the steps one by one to build and deploy the contract.

### Step 1 - Prepate structure and create a contract

By default starter kit contains two examples: `simple` and `singleton`, lets define a new workspace item `"src/voting"` in `asconfig.json` so it will look like this:

```sh
{
  "workspaces": [
    "src/simple",
    "src/singleton",
    "src/voting"
  ]
}
```

Then lets add a new component into the source folder called `voting` and another two folders `assembly` and `__tests__` inside it:

```sh
mkdir src/voting
mkdir src/voting/assembly
mkdir src/voting/__tests__
```

Folder `__tests__` will contain some unit tests, so we also need to have a file to support the testing library used, we can just copy it from another folder:

```sh
cp -r src/simple/__tests__/as-pect.d.ts src/voting/__tests__/.
```

Then we can add an empty test file which we will later use to write tests:

```sh
touch src/voting/__tests__/index.unit.spec.ts
```

Next for now we can put some empty spec inside the test, you copy and paste it inside the `index.unit.spec.ts` file:

```ts
import { Contract } from "../assembly";

let contract: Contract;

beforeEach(() => {
  contract = new Contract();
});

describe("Voting Contract", () => {
  // VIEW method tests

  it("view method 1", () => {
    // expect(contract.method_name()).toStrictEqual("expected_result")
  });

  // CHANGE method tests

  it("change method 1", () => {
    // expect(contract.methodName("some-key", "some value")).toStrictEqual("Data processed.")
  });
});
```

And the last step is to create actual contract file `src/voting/index.ts`:

```sh
touch src/voting/assembly/index.ts
```

And to make it compilable we add some definition in the new `index.ts` file:

```ts
@nearBindgen
export class Contract {
  get_info(): string {
    return "This is the near protocol voting app smart contract tutorial.";
  }
}
```

To make sure everything is done properly in this step we can build the project with `yarn build:release` and
check `build/release/` folder, to verify it contains our new contract:

```sh
yarn
yarn build:release
ls build/release
```

If everything goes well you should see three files in `build/release` folder including new `voting.wasm`:

```sh
➜  near-voting-app-smart-contract-tut git:(main) ✗ ls build/release/

simple.wasm     singleton.wasm  voting.wasm
```

### Step 2 - Define Data Model

Lets create a new file called `model.ts` so it will hold all our models:

```sh
touch src/voting/assembly/model.ts
```

So because we are going to support multiple elections in parallel, every election will have a list of candidates and also a votes for every candidate lets add models in the `model.ts`, copy and paste this code:

```ts
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
}
```

These are all the models simple models, we will be using.

#### Now lets add constructor to the Election class so it will look like:

```ts
@nearBindgen
export class Election {
  public candidates: PersistentSet<Candidate>;
  public candidateIds: PersistentSet<AccountId>;
  public votes: PersistentMap<AccountId, PersistentSet<Vote>>;
  public voters: PersistentSet<AccountId>;
  public electionInfo: ElectionInfo;

  constructor(
    id: u8,
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
```

It is the main wrapper object for the elections, so it will contain all the candidates, votes and election metadata.

We are using `PersistentSet` to store `candidates` and `candidateIds`.

Why do we need to store `candidateIds` additionally? This is to be able to check if we have such candidate registered faster without the need of iterating over the objects.

To store the votes we are using `PersistenceMap` where the key is the candidate's `account_id` it will help us to get votes for a specific candidate.

We also store some metadata in `ElectionInfo` class, it will be used to return the general election information later in the smart contract.

### Step 3 - Contract Initialisation

So After we defined the data model we can jump into the business logic implementation.
Let us add the constructor and some properties to the contract. Replace the `voting/assembly/index.ts` so it will look like this:

```ts
import { PersistentSet, PersistentMap } from "near-sdk-core";
import { Election } from "./model";
@nearBindgen
export class Contract {
  private elections: PersistentMap<u32, Election>;
  private electionIds: PersistentSet<u32>;

  constructor() {
    this.elections = new PersistentMap<u32, Election>("e");
    this.electionIds = new PersistentSet<u32>("ei");
  }
}
```

Default constructor is needed to initialise our contract when it's deployed.
We are initialising empty `PersistentMap<u32, Election>` which will store all future elections,
and also `PersistentSet<u32>` of the electionId's so we can quickly check if the election with provided id exists.

### Step 4 - Define Readonly methods

Our voting contract will have some readonly methods, which do not mutate state, so they can be called with `near view`. Let's add several handy methods. Copy those three code snippets in the contract:

- `get_elections()` - get all existing elections:

  ```
  get_elections(): ElectionInfo[] {
    const electionIds = this.electionIds.values();
    let elections: ElectionInfo[] = [];
    for (let i: i32 = 0; i < electionIds.length; i++) {
      elections.push(this.elections.getSome(electionIds[i]).electionInfo);
    }
    return elections;
  }
  ```

- `get_candidates(electionId: u32)` - get all candidates for the specified `electionId`:

  ```ts
  get_candidates(electionId: u32): Candidate[] {
    assert(
      this.elections.contains(electionId),
      `No election with id [${electionId}] found. Did you mistype?`
    );
    return this.elections.getSome(electionId).candidates.values();
  }
  ```

- `get_votes(electionId: u32)` - get current voting results for the specified `electionId`:

  ```ts
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
  ```

  Also you would need to update imports so you can do it manually in the IDE or just replace the imports with this:

  ```ts
  import { PersistentSet, PersistentMap } from "near-sdk-core";
  import {
    Candidate,
    CandidateVotes,
    Election,
    ElectionInfo,
    ElectionVotes,
    Vote,
  } from "./model";
  ```

As you can see we are using `assert()` method in `get_candidates` and `get_votes`. This is very useful to add such assertions in your contracts, so you always know everything is going as expected:

```ts
assert(
  this.elections.contains(electionId),
  `No election with id [${electionId}] found.`
);
```

### Step 5 - Add Change State Methods

The next part of the implementation is the methods which will be modifying the contract state.
Those methods are marked with `@mutateState()` annotation in the contract. Lets add 3 methods to the code:
`add_election`, `add_candidacy`, and `add_vote`.

### Step 5.1 - Method `add_election` implementation

Now we can add the new method to register new election.
Lets take a look on the method signature:

```ts
add_election(
  title: string,
  description: string,
  startDate: Timestamp,
  endDate: Timestamp
): void
```

It accept Election Metadata Parameters: `title`, `description`, `startDate` and `endDate`
To generate unique election id we will be using random number generator `RNG` provided by near sdk.
In this method we don't need any assertions, so any near user can register new election.
Properties `startDate` and `endDate` will be used to set the start and end of election as a timestamp in milliseconds. You can pass `0` for both properties, then the default values will be used:

- default for start date is 1 day since election creation, so candidates will have 24 hours to submit their
  candidacy.
- default for end date is 7 days after the election start date, so contract will be accepting votes for the period of one week.

You can copy-paste the whole method in the contract:

```ts
@mutateState()
add_election(
  title: string,
  description: string,
  startDate: Timestamp,
  endDate: Timestamp
): void {
  const rng = new RNG<u16>(1, u16.MAX_VALUE);
  const electionId = rng.next();
  const start = startDate > 0
      ? startDate * 1000000
      : context.blockTimestamp + 86400000000000
  const election = new Election(
    electionId,
    context.sender,
    context.blockTimestamp,
    startDate > 0
      ? startDate * 1000000
      : context.blockTimestamp + 86400000000000,
    endDate > 0
      ? endDate * 1000000
      : start + 86400000000000 * 7,
    title,
    description
  );
  this.electionIds.add(electionId);
  this.elections.set(electionId, election);
}
```

### Step 5.2 - Method `add_candidacy` implementation

This method is used to submit the candidacy in the election by `electionId`.
Lets define the method definition:

```ts
@mutateState()
add_candidacy(
  electionId: u32,
  name: string,
  slogan: string,
  goals: string
): void {}
```

To verify that election exists we are using `assert()` method to check if we have election with the specified id in the contract storage:

```ts
assert(
  this.elections.contains(electionId),
  `No election with id [${electionId}] found. Did you mistype?`
);
```

We can also use `assert()` to check if there is no such candidate in the current election:

```ts
const election = this.elections.getSome(electionId);
assert(
  election.electionInfo.startDate > context.blockTimestamp,
  "Could not add candidacy to the ongoing elections."
);
```

And also we check if the candidates `name`, `slogan` and `goals` are defined. Because empty candidacy is no very informative:

```ts
assert(
  name.length > 0,
  "Name is required, put your account ID as name if you was us to put it on the election billboard!"
);
assert(
  slogan.length > 0,
  "Slogan is required, what are you going to print on the snapbacks and t-shirts?"
);
assert(
  goals.length > 0,
  "Goals is required, who will vote to you without the goals?"
);
```

After we verified all the properties we can add the candidate in the election candidates list:

```ts
const date = context.blockTimestamp;
const candidate = new Candidate(candidateId, date, name, slogan, goals);
election.candidates.add(candidate);
election.candidateIds.add(candidateId);
this.elections.set(electionId, election);
```

Here is the full method definition which you can copy-paste to the contract.

```ts
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
    "Candidate is already registered in this election, don't cheat! Your votes will not sum up in case you register yourself twice :)"
  );
  assert(
    name.length > 0,
    "Name is required, put your account ID as name if you was us to put it on the election billboard!"
  );
  assert(
    slogan.length > 0,
    "Slogan is required, what are you going to print on the snapbacks and t-shirts?"
  );
  assert(
    goals.length > 0,
    "Goals is required, who will vote to you without the goals?"
  );

  const date = context.blockTimestamp;
  const candidate = new Candidate(candidateId, date, name, slogan, goals);
  election.candidates.add(candidate);
  election.candidateIds.add(candidateId);
  this.elections.set(electionId, election);
}
```

### Step 5.3 - Method `add_vote` implementation

The last method is `add_vote` which allows users to submit their vote for a specific candidate in the election.
Here we also use assertions to validate that election by id exists, whether the candidate exists, and also if the user didn't vote yet, because you can only vote once in the whole election.
Here is the full method implementation, add this to the contract:

```ts
@mutateState()
add_vote(electionId: u32, candidateId: string, comment: string): void {
  assert(
    this.elections.contains(electionId),
    `No election with id [${electionId}] found. Did you mistype?`
  );
  const election = this.elections.getSome(electionId);
  assert(
    election.electionInfo.startDate > context.blockTimestamp,
    "Could not add vote to the election which is not yet started."
  );
  assert(
    election.electionInfo.endDate < context.blockTimestamp,
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
```

### Step 6 - Deploy the dev contract

We have build our contract with all the methods so we can already test it out, let's run this commands to build and deploy dev-contract. Make you are are logged in in the `near cli` using `near login` command prior to this step:

```sh
yarn build:release && near dev-deploy --wasmFile build/release/voting.wasm
```

If everything goes well, you should see something like this in your terminal:

```sh
➜  near-voting-app-smart-contract-tut git:(main) ✗ yarn build:release && near dev-deploy --wasmFile build/release/voting.wasm
yarn run v1.22.17
warning ../../package.json: No license field
$ asb
✨  Done in 16.10s.
Starting deployment. Account id: dev-1637852337467-70985280826279, node: https://rpc.testnet.near.org, helper: https://helper.testnet.near.org, file: build/release/voting.wasm
Transaction Id 641CmZv5cZHcWe773C8g5uaBDpqoTt8zp4CfBxjytEWR
To see the transaction in the transaction explorer, please open this url in your browser
https://explorer.testnet.near.org/transactions/641CmZv5cZHcWe773C8g5uaBDpqoTt8zp4CfBxjytEWR
Done deploying to dev-1637852337467-70985280826279
```

Congratulations, you contract is deployed now. So let's test it works. The last line in the terminal show you the dev contract name which looks like `dev-1234567890-123456789` this is the contract name you will be using. It is also added to the file `neardev/dev-account.env` and we will use is to set up ENV variables before we call the contract.

### Step 7 - Initialise dev contract

To initialise contract we can use the `new` method which will call the `Contract` class `constructor`. To init the contract use this command:

```sh
source neardev/dev-account.env
near call $CONTRACT_NAME new --accountId $CONTRACT_NAME
```

### Step 8 - Use dev contract

Let's use our contract, by calling the methods we added to verify the process of election is working as expected.

### Step 8.1 - Add new election

Let's add new election using `near cli` using `add_election` and then call `get_elections` to check our new election. You can pass startDate to the current time stamp + 5 minutes, so you will have 5 minutes to submit the candidates before the voting start, you can use some service like `currentmillis.com`

```sh
source neardev/dev-account.env
near call $CONTRACT_NAME add_election '{"title": "First election!", "description": "Testing the election model.", "startDate": "1637874480000", "endDate": "0"}' --accountId $CONTRACT_NAME
near view $CONTRACT_NAME get_elections
```

The result of `get_election` will look like this:

```sh
➜  near-voting-app-smart-contract-tutorial git:(main) ✗ near view $CONTRACT_NAME get_elections
View call: dev-1637871596730-46015068107726.get_elections()
[
  {
    id: 43094,
    initiator: 'dev-1637871596730-46015068107726',
    creationDate: '1637874334500905663',
    startDate: '1637874360000000000',
    endDate: '1638479160000000000',
    title: 'First election!',
    description: 'Testing the election model.'
  }
]
```

Now you have the election id `38749` which you can use to submit candidacy, for you it will be different id, so you can use the once you received from the contract.

### Step 8.2 - Add new candidacy

To add new candidacy we are going to use `add_candidacy` method and then you call `get_candidates` to verify that your candidacy has been added:

```sh
source neardev/dev-account.env
near call $CONTRACT_NAME add_candidacy '{"electionId": 38749, "name": "Donald Duck", "slogan": "Make river great again!", "goals": "Do good, do not do bad!"}' --accountId $CONTRACT_NAME
near view $CONTRACT_NAME get_candidates '{"electionId": 38749}'
```

You should get back the list of candidates, containing only one:

```sh
➜  near-voting-app-smart-contract-tutorial git:(main) ✗ near view $CONTRACT_NAME get_candidates '{"electionId": 42719}'
View call: dev-1637871596730-46015068107726.get_candidates({"electionId": 38749})
[
  {
    accountId: 'dev-1637871596730-46015068107726',
    registrationDate: '1637873336622836513',
    name: 'Donald Duck',
    slogan: 'Make river great again!',
    goals: 'Do good, do not do bad!'
  }
]
```

### Step 8.3 - Add new vote

To add new vote you should use the third method we have added: `add_vote`.
It will only accept candidates if the start date is < current timestamp, meaning that the election is already in progress. The candidate id you can get from the list of candidates you got in the previous step:

```sh
#!/bin/bash
source neardev/dev-account.env
near call $CONTRACT_NAME add_vote '{"electionId": 38749, "candidateId": "dev-1637871596730-46015068107726", "comment": "I believe that guy!"}' --accountId $CONTRACT_NAME
```

When your vote has been added you can use the read method `get_votes` to check the current votes of the election:

```sh
#!/bin/bash
source neardev/dev-account.env
near view $CONTRACT_NAME get_votes '{"electionId": 38749}'
```

You will get the response with the list of election

```sh
➜  near-voting-app-smart-contract-tutorial git:(main) ✗ near view $CONTRACT_NAME get_votes '{"electionId": 38749}'
View call: dev-1637871596730-46015068107726.get_votes({"electionId": 38749})
{
  election: {
    id: 38749,
    initiator: 'dev-1637871596730-46015068107726',
    creationDate: '1637874426134027892',
    startDate: '1637874480000000000',
    endDate: '1638479280000000000',
    title: 'First election!',
    description: 'Testing the election model.'
  },
  votes: [
    {
      candidate: {
        accountId: 'dev-1637871596730-46015068107726',
        registrationDate: '1637874452572363281',
        name: 'Donald Duck',
        slogan: 'Make river great again!',
        goals: 'Do good, do not do bad!'
      },
      votes: [
        {
          accountId: 'dev-1637871596730-46015068107726',
          date: '1637874808410611274',
          candidateId: 'dev-1637871596730-46015068107726',
          comment: 'I believe that guy!',
          donation: '0'
        }
      ]
    }
  ]
}
```

When the election `endDate` will be less than the current date it will mean that election process is finished and you will not be able submit votes, so `get_votes` will be giving the final results of voting.

### Production deployment

When you have tested the whole flow with the dev contract you can deploy the contract to the actual account or sub-account. To deploy the contract you can use this command passing the contract account you want:

```sh
near deploy --wasmFile build/release/voting.wasm --accountId voting.your_account.testnet
```

You should get the transaction id after succesfull deployment:

```sh
➜  near-voting-app-smart-contract-tutorial git:(main) ✗ near create-account voting.your_account.testnet --masterAccount lkskrnk.testnet
Saving key to '/Users/oleksandrkorniienko/.near-credentials/testnet/voting.your_account.testnet.json'
Account voting.your_account.testnet for network "testnet" was created.
```

### Final

That's it, now you can try to build some nice web app to have a frontend application which can use your smart contract.
Useful library to get started with the js api for building near web apps is [near-api-js](https://github.com/near/near-api-js) or if you're familiar with react you can use [create-near-app](https://github.com/near/create-near-app) library. Good luck!

Full implementation of the contract can be found [here](https://github.com/oleksanderkorn/near-voting-app-smart-contract-tutorial/tree/ready-tutorial)
