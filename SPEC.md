# Overview

Let's build a site for logging workouts.

# Data Model
The basic unit of the workout is an Exercise, which is a collection of
1 or more Sets.  A Set is a collection of reps performed at a given
weight.  The app should implement functionality for adding, editing
and viewing the history of exercises.  Each Exercise should also
contain a field for freeform notes.

The main lifts are:

- barbell squat
- front squat
- safety bar squat
- barbell deadlift
- bench overhead press
- bench
- pullups


# Choosing the next workout
A key part of the design is that it must be as easy as possible to
select the next workout.  In particular, when the user selects a lift,
the history of all sessions for that lift should appear in a readily
accessible form.  This should be displayed in the following graphs:

## Temporal Graph
- In this graph, we display the date on the x axis, and the effective
  1RM and volume on the y axis.
  
## Lifting Isocline Graph
In this graph, reps is displayed on the x axis, and weight is
displayed on the y axis.  "Lifting Isocline Curves" appear in dashed lines,
illustrating lifts of equal effective 1RM.  

## Effective 1RM
Each (weight, rep) coordinate corresponds to some effective 1RM.  To
my knowledge, there are at least three well-regarded studies that
attempt to model the fraction of one's 1rm that one can lift for any
given number of reps.  For this site, we should find the curves from
those three studies and average their data points where available or
linearly interpolate where they are not.

## How to actually choose the next workout.
In general, if the last workout was performed at (W, R), the default
for the next workout is (W + 5, R). (All units in pounds.)  But if the
user doesn't feel capable of performing (W + 5, R), we should find all
combinations (W', R') such that 1RM(W, R) < 1RM(W', R') <= 1RM(W + 5,
R) and display them, sorted by 1RM.  Then the user can select their
desired weight / rep combination and begin the workout.

# Workout In-Progress Page
Once the user selects their desired workout, we should show a workout
in progress page that is maximally comfy for visualizing progress and
reducing cognitive fatigue.  The basic UI should be a vertical list of
warmup sets, work sets and rest periods.

## Warm up sets
Warm up sets always begin with 5 reps of the bar.  We then perform
warmup sets with the following principles in mind:

1. We never add more than 90lbs to the bar between workout sets.
2. We perform a total of three warmup sets, unless that conflicts with (1)
3. The penultimate workout set has 3 reps, and the last has 1.
4. There is a 2 minute rest period after the last warmup set, otherwise rests are ad libitum.

## Work Sets
The UI element for each work set should show Weight, Reps, 1RM, and
Volume.  There should also be a running total of cumulative volume for
all sets of that lift in the session.

There's a 5 minute break between work sets.

If a lift is failed, there should be a convenient UI for selecting
another (W, R) combo for remaining sets according to the methods
described in "How to actually choose the next workout".

# Data Logging
The workout log can be found at ~/misc/lifts.csv.  After the
completion of a workout, the data should be added to lifts.csv
according to the existing format.

